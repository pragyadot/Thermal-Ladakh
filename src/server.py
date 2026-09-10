"""
THERMAL//LADAKH — Backend API Server
======================================
Serves the frontend (static/) AND exposes REST endpoints that run the SAME
validated RK4 direct-gain thermal model used in shelter_thermal_model.py /
the Streamlit app - using your real NASA POWER weather data and real
material properties CSV. This replaces the frontend's old hardcoded/fake
physics with real computed results.

Run with:   python3 server.py
Then open:  http://localhost:5000
"""

import os
from io import StringIO

import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "static")

IRR_PATH = os.path.join(DATA_DIR, "ladakh_weather.csv")
TEMP_PATH = os.path.join(DATA_DIR, "POWER_Point_Hourly_20251201_20260131_034d15N_077d58E_LST.csv")
MAT_PATH = os.path.join(DATA_DIR, "ladakh_materials_thermal_properties__1_.csv")

app = Flask(__name__, static_folder=None)
CORS(app)

# ---------------------------------------------------------------------------
# LOAD REAL DATA ONCE AT STARTUP
# ---------------------------------------------------------------------------

def load_power_csv(path, value_cols):
    with open(path, "r") as f:
        lines = f.readlines()
    start_idx = next(i for i, l in enumerate(lines) if l.startswith("YEAR"))
    df = pd.read_csv(StringIO("".join(lines[start_idx:])))
    df["datetime"] = pd.to_datetime(dict(year=df.YEAR, month=df.MO, day=df.DY, hour=df.HR))
    return df[["datetime"] + value_cols]


def load_all_data():
    irr_df = load_power_csv(IRR_PATH, ["ALLSKY_SFC_SW_DWN", "WS2M", "RH2M"])
    temp_df = load_power_csv(TEMP_PATH, ["T2M"])
    data = pd.merge(temp_df, irr_df, on="datetime", how="inner")
    data = data.replace(-999, np.nan).dropna(subset=["T2M", "ALLSKY_SFC_SW_DWN"])
    data = data.sort_values("datetime").reset_index(drop=True)
    data["I"] = data["ALLSKY_SFC_SW_DWN"]
    data["T_out"] = data["T2M"]

    mat = pd.read_csv(MAT_PATH)
    mat.columns = ["Material", "k", "rho", "cp", "L_thick", "alpha", "U"]
    mat = mat.set_index("Material")
    return data, mat


WEATHER_DATA, MATERIALS_DF = load_all_data()
print(f"Loaded {len(WEATHER_DATA)} hourly weather records: "
      f"{WEATHER_DATA.datetime.min()} to {WEATHER_DATA.datetime.max()}")
print(f"Loaded {len(MATERIALS_DF)} materials")

ORIENTATION_MULTIPLIER = {"South": 1.0, "East": 0.7, "West": 0.7, "North": 0.3}
R_FILM = 0.17           # combined interior+exterior surface film resistance, m2K/W
RHO_AIR, C_AIR = 1.2, 1005
U_WINDOW = 1.49
if "Double Glazed Window (Air Cavity)" in MATERIALS_DF.index:
    U_WINDOW = float(MATERIALS_DF.loc["Double Glazed Window (Air Cavity)", "U"])
TAU_WINDOW = 0.75


# ---------------------------------------------------------------------------
# CORE PHYSICS (same governing equation/model as the validated Python script)
# ---------------------------------------------------------------------------

def compute_wall_properties(layers, A_wall_net):
    """
    layers: list of dicts {k, rho, cp, L} where L is thickness in METRES.
    Returns U_wall (W/m2K), mc (J/K, thermal mass of these layers over A_wall_net),
    and R_total (m2K/W).
    """
    R_total = R_FILM + sum(layer["L"] / layer["k"] for layer in layers)
    U_wall = 1.0 / R_total
    mc = sum(layer["rho"] * layer["L"] * layer["cp"] * A_wall_net for layer in layers)
    return U_wall, mc, R_total


def run_simulation(geometry, layers, duration_days, orientation, start_date=None):
    """
    geometry: {length, width, height, window_area}
    layers: list of {material, thickness_mm}
    start_date: optional "YYYY-MM-DD" string. If provided, the simulation window
    starts at the first available hourly record on/after this real date within
    the loaded weather dataset. If omitted, defaults to the first record in the
    dataset (unchanged legacy behavior).
    Returns dict with time series + summary, using REAL weather data and the
    validated direct-gain RK4 model:
        Q_solar = tau * A_window * I(t) * orientation_multiplier
        Q_loss  = U_wall*A_wall_net*(T_in-T_out) + U_window*A_window*(T_in-T_out)
        m*c * dT_in/dt = Q_solar - Q_loss
    """
    L, W, H = geometry["length"], geometry["width"], geometry["height"]
    A_window = geometry["window_area"]
    A_walls = 2 * (L + W) * H
    A_roof = L * W
    A_total = A_walls + A_roof
    A_wall_net = max(A_total - A_window, 0.1)
    V_air = L * W * H

    layer_props = []
    for layer in layers:
        row = MATERIALS_DF.loc[layer["material"]]
        layer_props.append(dict(k=float(row.k), rho=float(row.rho), cp=float(row.cp),
                                 L=layer["thickness_mm"] / 1000.0))

    U_wall, mc_wall, R_total = compute_wall_properties(layer_props, A_wall_net)
    mc = mc_wall + RHO_AIR * V_air * C_AIR

    orient_mult = ORIENTATION_MULTIPLIER.get(orientation, 1.0)

    start_idx = 0
    if start_date:
        target = pd.to_datetime(start_date)
        matches = WEATHER_DATA.index[WEATHER_DATA["datetime"] >= target]
        if len(matches) == 0:
            raise ValueError(
                f"start_date {start_date} is after the last available record "
                f"({WEATHER_DATA['datetime'].max()}); no data to simulate."
            )
        start_idx = int(matches[0])

    n_hours = min(int(duration_days * 24), len(WEATHER_DATA) - start_idx)
    df = WEATHER_DATA.iloc[start_idx:start_idx + n_hours].reset_index(drop=True)
    T_out_arr = df["T_out"].values
    I_arr = df["I"].values
    n = len(df)
    dt = 3600.0

    def interp(arr, t_frac, i):
        if i + 1 >= len(arr):
            return arr[i]
        return arr[i] + t_frac * (arr[i + 1] - arr[i])

    T = np.zeros(n)
    T[0] = T_out_arr[0]
    for i in range(n - 1):
        Tout_i, I_i = T_out_arr[i], I_arr[i]
        Tout_mid = interp(T_out_arr, 0.5, i)
        I_mid = interp(I_arr, 0.5, i)
        Tout_next, I_next = T_out_arr[min(i + 1, n - 1)], I_arr[min(i + 1, n - 1)]

        def dTdt(T_in, T_amb, I_val):
            Q_solar = TAU_WINDOW * A_window * I_val * orient_mult
            Q_loss = (U_wall * A_wall_net * (T_in - T_amb)
                      + U_WINDOW * A_window * (T_in - T_amb))
            return (Q_solar - Q_loss) / mc

        k1 = dTdt(T[i], Tout_i, I_i)
        k2 = dTdt(T[i] + 0.5 * dt * k1, Tout_mid, I_mid)
        k3 = dTdt(T[i] + 0.5 * dt * k2, Tout_mid, I_mid)
        k4 = dTdt(T[i] + dt * k3, Tout_next, I_next)
        T[i + 1] = T[i] + (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)

    Q_solar_series = TAU_WINDOW * A_window * I_arr * orient_mult
    Q_loss_series = (U_wall * A_wall_net * (T - T_out_arr)
                      + U_WINDOW * A_window * (T - T_out_arr))
    trapz_fn = getattr(np, "trapz", None) or np.trapezoid
    solar_kwh = float(trapz_fn(Q_solar_series, dx=dt) / 3.6e6)
    loss_kwh = float(trapz_fn(Q_loss_series, dx=dt) / 3.6e6)

    night_mask = (df["datetime"].dt.hour >= 22) | (df["datetime"].dt.hour <= 5)
    day_mask = ~night_mask

    return {
        "labels": [f"T+{i}h" for i in range(n)],
        "timestamps": df["datetime"].dt.strftime("%Y-%m-%d %H:%M").tolist(),
        "interior_temp": [round(float(x), 2) for x in T],
        "ambient_temp": [round(float(x), 2) for x in T_out_arr],
        "solar_flux_kw": [round(float(x) / 1000.0, 3) for x in Q_solar_series],
        "loss_flux_kw": [round(-float(x) / 1000.0, 3) for x in Q_loss_series],
        "summary": {
            "U_value": round(U_wall, 4),
            "R_value": round(R_total, 4),
            "thermal_mass_MJ": round(mc / 1e6, 2),
            "total_thickness_mm": round(sum(l["thickness_mm"] for l in layers), 1),
            "footprint_m2": round(L * W, 2),
            "volume_m3": round(V_air, 2),
            "glazing_ratio": round(A_window / A_total, 3),
            "avg_interior_temp": round(float(np.mean(T)), 2),
            "min_interior_temp": round(float(np.min(T)), 2),
            "max_interior_temp": round(float(np.max(T)), 2),
            "avg_night_interior_temp": round(float(T[night_mask.values].mean()), 2),
            "avg_day_interior_temp": round(float(T[day_mask.values].mean()), 2),
            "avg_ambient_temp": round(float(np.mean(T_out_arr)), 2),
            "solar_captured_kwh": round(solar_kwh, 2),
            "heat_lost_kwh": round(loss_kwh, 2),
            "night_advantage_c": round(
                float(T[night_mask.values].mean() - T_out_arr[night_mask.values].mean()), 2
            ),
        },
    }


# ---------------------------------------------------------------------------
# API ROUTES
# ---------------------------------------------------------------------------

@app.route("/api/materials")
def api_materials():
    out = []
    for name, row in MATERIALS_DF.iterrows():
        out.append({
            "name": name,
            "k": float(row.k),
            "rho": float(row.rho),
            "cp": float(row.cp),
            "default_thickness_mm": float(row.L_thick) * 1000,
            "alpha": float(row.alpha),
            "U_reference": float(row.U),
        })
    return jsonify(out)


@app.route("/api/environment")
def api_environment():
    """Real ambient temperature + solar irradiance for the full loaded dataset."""
    days = request.args.get("days", default=None, type=int)
    df = WEATHER_DATA if days is None else WEATHER_DATA.iloc[: days * 24]
    latest = WEATHER_DATA.iloc[-1]
    return jsonify({
        "labels": [f"T+{i}h" for i in range(len(df))],
        "timestamps": df["datetime"].dt.strftime("%Y-%m-%d %H:%M").tolist(),
        "ambient_temp": [round(float(x), 2) for x in df["T_out"]],
        "solar_irradiance": [round(float(x), 1) for x in df["I"]],
        "wind_speed": [round(float(x), 2) for x in df["WS2M"]],
        "stats": {
            "min_temp": round(float(df["T_out"].min()), 1),
            "max_temp": round(float(df["T_out"].max()), 1),
            "peak_solar": round(float(df["I"].max()), 1),
            "avg_temp": round(float(df["T_out"].mean()), 1),
            "avg_wind": round(float(df["WS2M"].mean()), 1),
        },
        "latest": {
            "timestamp": latest["datetime"].strftime("%Y-%m-%d %H:%M"),
            "ambient_temp": round(float(latest["T_out"]), 1),
            "solar_irradiance": round(float(latest["I"]), 0),
            "wind_speed": round(float(latest["WS2M"]), 1),
        },
        "date_range": {
            "min": WEATHER_DATA["datetime"].min().strftime("%Y-%m-%d"),
            "max": WEATHER_DATA["datetime"].max().strftime("%Y-%m-%d"),
        },
    })


@app.route("/api/simulate", methods=["POST"])
def api_simulate():
    body = request.get_json(force=True)
    try:
        geometry = body["geometry"]
        layers = body["layers"]           # [{material, thickness_mm}, ...] 1 or 2 items
        duration_days = body.get("duration_days", 3)
        orientation = geometry.get("orientation", "South")
        start_date = body.get("start_date")  # optional "YYYY-MM-DD", real dataset date
        result = run_simulation(geometry, layers, duration_days, orientation, start_date)
        return jsonify(result)
    except KeyError as e:
        return jsonify({"error": f"Missing field: {e}"}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/compare", methods=["POST"])
def api_compare():
    """Run several named configurations and return a comparison table."""
    body = request.get_json(force=True)
    try:
        geometry = body["geometry"]
        duration_days = body.get("duration_days", 3)
        orientation = geometry.get("orientation", "South")
        start_date = body.get("start_date")
        configs = body["configs"]  # [{name, layers:[{material,thickness_mm},...]}, ...]

        rows = []
        series_by_config = {}
        for cfg in configs:
            result = run_simulation(geometry, cfg["layers"], duration_days, orientation, start_date)
            s = result["summary"]
            rows.append({
                "name": cfg["name"],
                "layer1": cfg["layers"][0]["material"] if len(cfg["layers"]) > 0 else "-",
                "layer2": cfg["layers"][1]["material"] if len(cfg["layers"]) > 1 else "NONE",
                "u_value": s["U_value"],
                "thermal_mass_MJ": s["thermal_mass_MJ"],
                "min_temp": s["min_interior_temp"],
                "avg_temp": s["avg_interior_temp"],
                "night_advantage_c": s["night_advantage_c"],
            })
            series_by_config[cfg["name"]] = result["interior_temp"]

        best = max(rows, key=lambda r: r["avg_temp"])["name"]
        return jsonify({"rows": rows, "series": series_by_config,
                         "labels": [f"T+{i}h" for i in range(len(next(iter(series_by_config.values()))))],
                         "best_config": best})
    except KeyError as e:
        return jsonify({"error": f"Missing field: {e}"}), 400
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# STATIC FRONTEND
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


if __name__ == "__main__":
    app.run(debug=False, port=5000)

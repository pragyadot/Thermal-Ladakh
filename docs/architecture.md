# System Architecture

## 1. Overview

THERMAL~LADAKH is a web-based thermal analysis platform for evaluating shelter designs under high-altitude climatic conditions.

The system combines:

- Regional environmental data
- Material thermal properties
- User-defined shelter parameters
- Solar heat gain
- Heat transfer through the shelter envelope
- RK4 numerical integration
- Interactive result visualization
- ANSYS-based validation

The application follows a client-server architecture with a browser-based frontend and a Python Flask backend.

---

## 2. Architecture

```text
                    User
                     |
                     v
              Web Browser
                     |
                     v
          HTML / CSS / JavaScript
                     |
              HTTP / REST API
                     |
                     v
              Flask Backend
                     |
       +-------------+-------------+
       |             |             |
       v             v             v
 Weather Data   Material Data   User Inputs
       |             |             |
       +-------------+-------------+
                     |
                     v
              Thermal Model
                     |
                     v
                  RK4 Solver
                     |
                     v
             Simulation Results
                     |
          +----------+----------+
          |                     |
          v                     v
   Visualization          Comparison
````

---

## 3. Frontend

The frontend is implemented using HTML, CSS and JavaScript.

### Responsibilities

* Provide the user interface
* Collect shelter design parameters
* Display available materials
* Provide simulation controls
* Send configuration data to the backend
* Display temperature and heat-transfer results
* Compare different shelter configurations

### Main Files

```text
src/static/
├── index.html
├── style.css
├── app.js
└── assets/
```

`index.html` defines the application structure, `style.css` controls presentation, and `app.js` manages user interaction, API requests and result visualization.

---

## 4. Backend

The backend is implemented using Python and Flask.

### Responsibilities

* Load environmental datasets
* Load material thermal properties
* Process user-defined shelter parameters
* Calculate thermal parameters
* Run the thermal simulation
* Perform RK4 numerical integration
* Return results through REST API endpoints
* Compare different shelter configurations

Main backend file:

```text
src/server.py
```

---

## 5. Data Layer

The application uses locally stored datasets so that the simulation can be reproduced using the same input data.

```text
src/data/
├── ladakh_weather.csv
├── ladakh_materials_thermal_properties__1_.csv
└── POWER_Point_Hourly_20251201_20260131_034d15N_077d58E_LST.csv
```

### Weather Data

Provides regional environmental conditions used by the thermal model.

### Material Data

Contains thermal properties such as material thermal conductivity used to calculate heat transfer through the shelter envelope.

### NASA POWER Data

Provides hourly environmental inputs including ambient temperature and solar irradiance.

---

## 6. Thermal Simulation

The thermal model represents the shelter as a simplified lumped thermal system.

The indoor temperature changes according to the balance between heat entering and leaving the shelter.

The general form is:

```text
dT/dt = f(T, Tambient, Solar, Shelter Parameters)
```

The model considers parameters such as:

* Ambient temperature
* Solar irradiance
* Shelter dimensions
* Wall thickness
* Material thermal conductivity
* Shelter orientation
* Window area
* Solar transmissivity

The wall thermal resistance and heat-transfer behaviour are recalculated when the user changes material or wall thickness.

---

## 7. RK4 Solver

The thermal differential equation is solved using the fourth-order Runge-Kutta method.

For:

```text
dT/dt = f(t, T)
```

the solver calculates:

```text
k1 = f(t, T)

k2 = f(t + h/2, T + hk1/2)

k3 = f(t + h/2, T + hk2/2)

k4 = f(t + h, T + hk3)
```

The next temperature value is:

```text
T(next) = T + h/6 (k1 + 2k2 + 2k3 + k4)
```

The simulation uses hourly environmental data as the time-dependent input.

---

## 8. Solar Heat Gain

Solar radiation is incorporated as a thermal input to the shelter.

The contribution depends on the shelter orientation and window configuration.

Current orientation factors are:

| Orientation | Multiplier |
| ----------- | ---------- |
| South       | 1.0        |
| East        | 0.7        |
| West        | 0.7        |
| North       | 0.3        |

Solar transmission through the window is also considered using the configured window area and transmissivity.

---

## 9. API Layer

The frontend communicates with the Flask backend through REST API endpoints.

The API is responsible for transferring:

```text
User Configuration
        |
        v
     Backend
        |
        v
Thermal Calculation
        |
        v
Simulation Results
        |
        v
     Frontend
```

The backend exposes endpoints for retrieving materials, running simulations and comparing shelter configurations.

---

## 10. ANSYS Validation

The RK4 thermal model is independently validated using ANSYS thermal simulations.

For representative configurations, equivalent:

* Shelter geometry
* Material properties
* Wall thickness
* Thermal boundary conditions

are used for comparison.

The validation process is:

```text
Same Configuration
        |
   +----+----+
   |         |
   v         v
  RK4      ANSYS
 Model      Model
   |         |
   v         v
RK4 Result ANSYS Result
   |         |
   +----+----+
        |
        v
 Result Comparison
```

The purpose of the validation is to verify that the simplified numerical model produces physically consistent thermal behaviour.

ANSYS validation information is stored in:

```text
docs/ansys_validation.txt
```

Validation screenshots are stored in:

```text
assets/screenshots/ansys/
```

---

## 11. Configuration Comparison

The application allows different shelter configurations to be evaluated and compared.

A configuration can be changed by modifying parameters such as:

* Material
* Wall thickness
* Orientation
* Window configuration
* Shelter dimensions

The backend independently simulates the selected configurations and returns their thermal results for comparison.

---

## 12. Technology Stack

| Layer               | Technology              |
| ------------------- | ----------------------- |
| Frontend            | HTML5, CSS3, JavaScript |
| Backend             | Python, Flask           |
| API                 | REST                    |
| Numerical Computing | NumPy                   |
| Data Processing     | Pandas                  |
| Numerical Method    | RK4                     |
| Environmental Data  | NASA POWER              |
| Validation          | ANSYS                   |

---

## 13. Directory Structure

```text
Thermal-Ladakh/
│
├── README.md
├── .gitignore
├── requirements.txt
│
├── src/
│   ├── server.py
│   │
│   ├── data/
│   │   ├── ladakh_weather.csv
│   │   ├── ladakh_materials_thermal_properties__1_.csv
│   │   └── POWER_Point_Hourly_20251201_20260131_034d15N_077d58E_LST.csv
│   │
│   └── static/
│       ├── index.html
│       ├── style.css
│       ├── app.js
│       └── assets/
│           ├── drdo-logo.png
│           ├── hero-final-night.jpg
│           ├── hero-final-day.jpg
│           └── shelter-diagram.png
│
├── docs/
│   ├── architecture.md
│   └── ansys_validation.txt
│
├── assets/
│   └── screenshots/
│       └── ansys/
│
└── submission/
    ├── PRESENTATION.md
    └── DEMO.md
```

---

## 14. Execution Flow

The complete application flow is:

```text
User Opens Application
          |
          v
Configure Shelter
          |
          v
Select Material
          |
          v
Set Design Parameters
          |
          v
Request Simulation
          |
          v
Flask Backend
          |
          v
Load Weather + Material Data
          |
          v
Calculate Thermal Parameters
          |
          v
Run RK4 Simulation
          |
          v
Generate Temperature / Heat Results
          |
          v
Return Results to Frontend
          |
          v
Visualize Results
          |
          v
Compare Configurations
```

---

## 15. Design Approach

The architecture separates the user interface, backend processing, data and numerical simulation.

This separation allows:

* The frontend to focus on interaction and visualization
* The backend to handle thermal calculations
* Datasets to remain independently maintainable
* The numerical model to be modified without redesigning the interface
* Additional regions and materials to be added in the future
* Independent validation of the thermal model using ANSYS

The current implementation is designed for interactive preliminary thermal analysis rather than replacing detailed engineering simulation for final construction decisions.




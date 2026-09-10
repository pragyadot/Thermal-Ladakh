
# THERMAL~LADAKH

## Regional Shelter Thermal Management System

THERMAL~LADAKH is a region-specific thermal analysis and shelter design platform developed for high-altitude cold regions such as Ladakh.

The system allows users to configure a shelter, select construction materials, define design parameters, and evaluate the resulting thermal behaviour using real environmental data. The thermal model is solved using the fourth-order Runge-Kutta (RK4) numerical method and validated against ANSYS thermal simulations for representative shelter configurations.

---

## Problem Statement

Shelters in high-altitude regions experience significant thermal variations due to low ambient temperatures, high solar radiation during the day, and rapid heat loss after sunset.

Existing shelter designs are often developed without sufficiently considering the climatic conditions of the specific region. As a result, maintaining suitable indoor temperatures may require additional heating systems and increased energy consumption.

A region-specific approach is therefore required to evaluate how shelter geometry, material properties, wall thickness, orientation and openings influence thermal performance.

---

## Proposed Solution

THERMAL~LADAKH provides an interactive platform for preliminary thermal analysis of shelters under regional environmental conditions.

The system combines regional environmental data, material thermal properties, shelter geometry, solar heat gain, heat transfer through the shelter envelope and time-dependent numerical simulation into a single platform.

Users can modify shelter parameters and evaluate how those changes affect the predicted indoor temperature and heat-transfer behaviour. Different configurations can also be compared to study their relative thermal performance.

The numerical model is implemented using the fourth-order Runge-Kutta method and independently validated against ANSYS thermal simulations for representative cases.

---

## Key Features

- Region-specific thermal analysis for high-altitude environments
- Interactive shelter configuration
- Material selection using a thermal-property database
- Real environmental and solar irradiance data
- Time-dependent thermal simulation
- RK4-based numerical solution
- Solar heat gain and heat-loss analysis
- Orientation-dependent solar contribution
- Comparison of different shelter configurations
- ANSYS-based validation of representative simulation cases
- Interactive visualization of simulation results

---

## System Workflow

```text
Environmental Data
        |
        v
Shelter Configuration
        |
        v
Material Properties
        |
        v
Thermal Model
        |
        v
RK4 Numerical Integration
        |
        v
Indoor Temperature
Heat Gain / Heat Loss
        |
        v
Visualization and Comparison
        |
        v
ANSYS Validation


---

## Thermal Model

The shelter is represented using a lumped thermal model in which the indoor temperature changes according to the balance between heat entering and leaving the shelter.

The temperature evolution is represented generally as:

```text
dT/dt = f(T, Tambient, Solar, Shelter Parameters)
```

where:

* `T` is the indoor shelter temperature
* `Tambient` is the ambient temperature
* `Solar` represents the solar radiation input
* Shelter parameters include geometry, material properties, wall thickness, orientation and window configuration

The model accounts for the thermal behaviour of the shelter envelope and the solar contribution to the interior.

---

## RK4 Numerical Method

The thermal differential equation is solved using the fourth-order Runge-Kutta method.

For:

```text
dT/dt = f(t, T)
```

the four intermediate slopes are calculated as:

```text
k1 = f(t, T)

k2 = f(t + h/2, T + hk1/2)

k3 = f(t + h/2, T + hk2/2)

k4 = f(t + h, T + hk3)
```

The temperature at the next time step is then calculated as:

```text
T(next) = T + h/6 (k1 + 2k2 + 2k3 + k4)
```

The simulation uses the hourly environmental dataset as the time-dependent input, allowing the predicted indoor temperature to be evaluated throughout the available period.

---

## Thermal Resistance and Material Properties

The thermal behaviour of the shelter envelope depends on the thermal conductivity of the selected material and the specified wall thickness.

The model uses these properties to determine the thermal resistance and corresponding heat-transfer behaviour of the wall.

When the user changes the material or wall thickness, the relevant thermal parameters are recalculated before the simulation is performed.

This allows the effect of different construction materials and wall configurations to be evaluated directly.

---

## Solar Heat Gain

Solar radiation is an important thermal input for shelters in Ladakh.

The model incorporates solar irradiance into the thermal calculation and considers shelter orientation through orientation-dependent factors.

The current orientation multipliers are:

| Orientation | Solar Multiplier |
| ----------- | ---------------- |
| South       | 1.0              |
| East        | 0.7              |
| West        | 0.7              |
| North       | 0.3              |

Solar contribution through the window is also affected by the configured window area and a transmissivity factor.

---

## Data Sources

The project uses time-series environmental data and a material thermal-property database.

### Weather Data

`src/data/ladakh_weather.csv`

Contains regional weather information used by the application.

### Material Properties

`src/data/ladakh_materials_thermal_properties__1_.csv`

Contains thermal properties of the construction materials available for selection in the application.

### NASA POWER Dataset

`src/data/POWER_Point_Hourly_20251201_20260131_034d15N_077d58E_LST.csv`

Contains hourly environmental data used as input to the thermal simulation, including temperature and solar irradiance information.

The datasets are included in the repository to make the simulation reproducible using the same input data.

---

## ANSYS Validation

The thermal calculations performed by the RK4 model are independently validated using ANSYS thermal simulations.

For representative shelter configurations, equivalent shelter geometry, material properties, wall thickness and relevant thermal boundary conditions are used for both the RK4 model and the ANSYS simulation.

The resulting thermal behaviour from the RK4 model is then compared with the corresponding ANSYS solution.

The validation process is:

```text
Same Shelter Configuration
          |
     +----+----+
     |         |
     v         v
    RK4      ANSYS
   Model     Model
     |         |
     v         v
RK4 Results  ANSYS Results
     |         |
     +----+----+
          |
          v
    Result Comparison
          |
          v
     Model Validation
```

This provides an independent engineering reference for evaluating the numerical implementation used by the web application.

The ANSYS comparison is performed for representative configurations rather than every possible user input. The purpose is to verify that the simplified thermal model produces physically consistent results while remaining lightweight enough for interactive simulation and configuration comparison.

ANSYS validation evidence and solution information are available in:

`assets/screenshots/ansys/`

---

## System Architecture

The application uses a Flask-based backend with a browser-based frontend.

```text
                    Web Browser
                         |
                         v
                HTML / CSS / JavaScript
                         |
                         v
                   Flask Backend
                         |
          +--------------+--------------+
          |              |              |
          v              v              v
    Weather Data   Material Data   Thermal Model
                                       |
                                       v
                                      RK4
                                       |
                                       v
                              Simulation Results
                                       |
                         +-------------+-------------+
                         |                           |
                         v                           v
                   Visualization              Comparison
```

The backend is responsible for:

* Loading and processing datasets
* Loading material properties
* Processing shelter configuration
* Calculating thermal parameters
* Running the RK4 simulation
* Returning simulation results through REST endpoints
* Comparing shelter configurations

The frontend is responsible for:

* User input
* Shelter configuration
* Material selection
* Simulation controls
* Data visualization
* Displaying thermal results
* Configuration comparison

---

## Technology Stack

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Python
* Flask
* Flask-CORS

### Scientific Computing

* NumPy
* Pandas
* Runge-Kutta 4th Order numerical integration
* Thermal resistance and heat-transfer calculations

### Data and Validation

* Regional weather data
* NASA POWER data
* Material thermal-property data
* ANSYS thermal simulation

---

## Repository Structure

```text
Thermal-Ladakh/
|
├── README.md
├── .gitignore
├── requirements.txt
|
├── src/
|   ├── server.py
|   |
|   ├── data/
|   |   ├── ladakh_weather.csv
|   |   ├── ladakh_materials_thermal_properties__1_.csv
|   |   └── POWER_Point_Hourly_20251201_20260131_034d15N_077d58E_LST.csv
|   |
|   └── static/
|       ├── index.html
|       ├── style.css
|       ├── app.js
|       └── assets/
|           ├── drdo-logo.png
|           ├── hero-final-night.jpg
|           ├── hero-final-day.jpg
|           └── shelter-diagram.png
|
├── docs/
|   ├── architecture.md
|
├── assets/
|   └── screenshots/
|       └── ansys/
|
└── submission/
    ├── PRESENTATION.md
    └── DEMO.md
```

---

## Installation

### Requirements

* Python 3.x
* pip
* Git

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
```

Navigate to the project directory:

```bash
cd Thermal-Ladakh
```

Install the required dependencies:

```bash
pip install -r requirements.txt
```

---

## Running the Application

Start the Flask server:

```bash
python src/server.py
```

Open the application in a browser at:

```text
http://localhost:5000
```

---

## Using the Application

1. Configure the shelter parameters.
2. Select a construction material.
3. Specify wall thickness and other design parameters.
4. Select the shelter orientation.
5. Review the available environmental data.
6. Run the thermal simulation.
7. Examine the predicted indoor temperature.
8. Review solar heat gain and heat loss.
9. Compare different shelter configurations.
10. Refer to the ANSYS validation results for representative cases.

---

## Results

The application provides time-dependent thermal results rather than a single calculated temperature.

The results can be used to study:

* Indoor temperature variation
* Solar heat gain
* Heat loss
* Effect of wall material
* Effect of wall thickness
* Effect of shelter orientation
* Relative performance of different shelter configurations

This allows the user to evaluate the thermal implications of design decisions before considering physical implementation.

---

## Innovation

The primary focus of THERMAL~LADAKH is the integration of regional environmental data, configurable shelter design and numerical thermal modelling into a single interactive platform.

The system moves beyond a fixed thermal calculation by allowing users to change design parameters and observe their effect on the simulated thermal response.

The inclusion of ANSYS validation provides an additional engineering reference for evaluating the implemented numerical model.

The approach can also be adapted to other high-altitude and cold regions by using appropriate regional environmental datasets.

---

## Impact

A region-specific thermal analysis system can support:

* Improved passive thermal design
* More informed material selection
* Reduced dependence on active heating
* Preliminary evaluation of shelter configurations
* Better understanding of thermal behaviour in high-altitude environments
* More efficient early-stage shelter design

---

## Limitations

The current implementation is intended for preliminary thermal analysis and design comparison.

The simplified thermal model does not represent every physical phenomenon that can affect the performance of a real shelter. Factors such as detailed convection, thermal bridges, air infiltration, occupancy, moisture transfer and complex radiation effects may require more detailed modelling.

ANSYS validation is used as an independent check for representative configurations. It does not imply that the simplified RK4 model replaces a complete engineering simulation for final construction decisions. This is mainly due to the fact that ansys is a liscensed software.

---

## Future Scope

Possible extensions include:

* Support for additional high-altitude regions
* Additional construction materials
* More detailed 2D and 3D thermal modelling
* CFD-based analysis
* Detailed convection and radiation modelling
* Occupancy and internal heat-load modelling
* Ventilation and infiltration effects
* Automated shelter design optimization
* Cost and thermal-performance optimization
* Real-time weather data integration
* Expanded ANSYS validation across multiple configurations
* Cloud-based simulation and deployment

---

## Project Documentation

Additional documentation is available in the repository:

* `docs/architecture.md` — system architecture and implementation details
* `assets/screenshots/ansys/` — ANSYS validation screenshots
* `submission/PRESENTATION.md` — project presentation
* `submission/DEMO.md` — project demonstration video

---

## Demonstration

[View Project Demo](./submission/DEMO.md)

---

## Presentation

[View Project Presentation](./submission/SIH2026_ASPIRE.pdf)

---

## Team

**Project:** THERMAL~LADAKH — Regional Shelter Thermal Management System

**Team:** ASPIRE

**Institution:** NSUT




```
```

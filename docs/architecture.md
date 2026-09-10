# System Architecture

## THERMA~LADAKH — Regional Shelter Thermal Management System

---

## 1. System Overview

THERMAL~LADAKH is a web-based thermal analysis and decision-support system designed for shelters in high-altitude cold regions such as Ladakh.

The system combines:

- Regional environmental data
- Solar irradiance data
- Thermal properties of construction materials
- User-defined shelter parameters
- A numerical thermal simulation model
- Interactive visualization

The primary objective is to allow a user to experiment with different shelter configurations and understand how material selection, wall thickness, orientation, and environmental conditions influence the internal thermal behaviour of a shelter.

The application follows a lightweight client-server architecture where the browser handles interaction and visualization, while the Flask backend performs data processing and thermal simulation.

---

# 2. High-Level Architecture

```text
                         ┌──────────────────────┐
                         │        USER          │
                         │ Shelter Parameters   │
                         │ Material / Thickness │
                         │ Orientation / Design │
                         └──────────┬───────────┘
                                    │
                                    ▼
                 ┌─────────────────────────────────┐
                 │          WEB FRONTEND            │
                 │                                 │
                 │  HTML + CSS + JavaScript        │
                 │                                 │
                 │  • Design Configuration        │
                 │  • Environment View             │
                 │  • Simulation View              │
                 │  • Comparison View              │
                 │  • Charts & Visualizations      │
                 └───────────────┬─────────────────┘
                                 │
                         HTTP / REST API
                                 │
                                 ▼
                 ┌─────────────────────────────────┐
                 │          FLASK BACKEND          │
                 │                                 │
                 │  Request Processing             │
                 │  Data Loading                   │
                 │  Thermal Calculations            │
                 │  Simulation Engine              │
                 │  Comparison Engine              │
                 └───────┬──────────┬──────────────┘
                         │          │
              ┌──────────┘          └──────────────┐
              ▼                                     ▼
   ┌──────────────────────┐             ┌──────────────────────┐
   │ ENVIRONMENTAL DATA   │             │ MATERIAL DATA        │
   │                      │             │                      │
   │ Ladakh Weather       │             │ Thermal Conductivity │
   │ NASA POWER Data      │             │ Material Properties  │
   └──────────┬───────────┘             └──────────┬───────────┘
              │                                    │
              └────────────────┬───────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │   THERMAL MODEL          │
                  │                          │
                  │ • Solar Gain             │
                  │ • Heat Loss              │
                  │ • Wall U-Value           │
                  │ • Orientation Effect     │
                  │ • RK4 Integration        │
                  └────────────┬─────────────┘
                               │
                               ▼
                  ┌──────────────────────────┐
                  │     SIMULATION OUTPUT    │
                  │                          │
                  │ • Interior Temperature   │
                  │ • Solar Gain              │
                  │ • Heat Loss               │
                  │ • Design Comparison      │
                  └────────────┬─────────────┘
                               │
                               ▼
                  ┌──────────────────────────┐
                  │   FRONTEND VISUALIZATION │
                  │                          │
                  │ Charts + Metrics + UI    │
                  └──────────────────────────┘

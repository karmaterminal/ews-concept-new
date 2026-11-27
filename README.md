# EWS Concept New

This project is a **SvelteKit**-based front-end application for an Earthquake Early Warning System (EWS).

## Prerequisites
Before running this project, ensure you have installed:
- [Node.js](https://nodejs.org/) (version 18 or newer is recommended)
- [pnpm](https://pnpm.io/) (this project uses `pnpm` as the package manager, as indicated by `pnpm-lock.yaml`)

## Setup and Running the Project

1. **Open the project directory**:
   Make sure you are inside the project folder:
   ```bash
   cd ews-concept-new
   ```

2. **Install dependencies**:
   Run the following command to install all required packages:
   ```bash
   pnpm install
   ```
   *(Note: You can also use `npm install` if you don't have `pnpm` installed)*

3. **Environment Configuration**:
   Copy the `.env.example` configuration file to `.env`.
   
   For Windows (Command Prompt/PowerShell):
   ```cmd
   copy .env.example .env or .dev.vars
   ```
   
   For Mac/Linux:
   ```bash
   cp .env.example .env
   ```
   
   Open the newly created `.env` file and adjust the WebSocket or Socket Server URLs if necessary:
   ```env
   # WebSocket Server URL for real-time seismic data
   # https://github.com/bagusindrayana/seedlink-websocket
   PUBLIC_WEBSOCKET_URL=ws://localhost:8080

   # Socket Server for earthquake/tsunami data
   # https://github.com/bagusindrayana/ews-socket
   PUBLIC_SOCKET_DATA_URL=ws://localhost:8081
   ```

4. **Run the Development Server**:
   Start the local development server with the command:
   ```bash
   pnpm run dev
   ```
   Or start it and automatically open a new tab in your browser:
   ```bash
   pnpm run dev --open
   ```
   By default, the application will run at `http://localhost:5173`.

## Building for Production

To create a production version of your app (a compiled version ready for deployment):

```bash
pnpm run build
```

You can preview the production build by running:
```bash
pnpm run preview
```

## Data Sources

This application relies on two distinct external data sources for real-time operation and alert notifications. These sources are configured via the `.env` file. On the `thornfield` branch, the `/canticle` pages read a third (below).

### 1. Seedlink WebSocket (Real-time Seismic Data)
- **Repository**: [seedlink-websocket](https://github.com/bagusindrayana/seedlink-websocket)
- **Purpose**: Provides streaming, real-time seismic waveform data (e.g., MiniSEED format).
- **Usage**: Used to render live seismograms and waveform charts on the front-end dashboard.
- **Environment Variable**: `PUBLIC_WEBSOCKET_URL` (default: `ws://localhost:8080`)

### 2. EWS Socket (Earthquake & Tsunami Alerts)
- **Repository**: [ews-socket](https://github.com/bagusindrayana/ews-socket)
- **Purpose**: A WebSocket server that broadcasts structured alert data regarding recent earthquakes, parameters (magnitude, depth, location), and potential tsunami warnings.
- **Usage**: Triggers the UI popups, updates the recent earthquake list, and displays alert banners.
- **Environment Variable**: `PUBLIC_SOCKET_DATA_URL` (default: `ws://localhost:8081`)

### 3. Canticle shape gateway (`/canticle` pages, `thornfield` branch)
- **Repository**: [binary-canticle](https://github.com/karmaterminal/binary-canticle), its `canticle shape` command
- **Purpose**: Serves only the shape of what canticle stations emit (who, when, how much; never what) for the frond house pages ([docs/frond-house.md](docs/frond-house.md)).
- **Usage**: `/canticle`, `/canticle/helicorder` and `/canticle/status` read it through the server routes `src/routes/api/canticle-{shape,flow,drum}`. Add `?demo=1` for built-in demo data; `/canticle/house` is demo-only.
- **Environment Variables**: `CANTICLE_SHAPE_URL`, `CANTICLE_FLOW_URL` and `CANTICLE_DRUM_URL`, read by the server from `process.env` (defaults: `http://127.0.0.1:8766/api/shape`, `/api/flow` and `/api/drum`)
- **Running today**: silas runs these pages (user unit `ews-canticle`, a `vite preview` build), fed by its `canticle-shape` unit.


## Support Me!
[![Support me on Sociabuzz](https://img.shields.io/badge/Support%20Me-Sociabuzz-orange?style=for-the-badge&logo=buymeacoffee&logoColor=white)](https://sociabuzz.com/bagusindrayana/tribe)

# ✈️ AeroMetrics — Modern Airline Network & Route Analytics

A high-performance web platform to visualize, analyze, and graph airline route networks, passenger traffic, yield economics, and city connectivity.

---

## 🌟 Key Features

1. **Clean Executive Dashboard**:
   - **Busiest Passenger Corridors**: Top routes by passenger traffic (PAX) with daily volume estimates.
   - **Estimated Route Revenue**: Calculated as $\text{PAX} \times \text{Average Fare}$.
   - **Distance vs. Ticket Fare Regression**: Scatter plot with pricing curve and bubble sizing proportional to passenger volume.
   - **Haul Type Distribution**: Short-haul, medium-haul, and long-haul sector breakdown.

2. **Interactive Global Flight Route Map**:
   - Curved geodesic great-circle flight arcs connecting origin and destination airports.
   - High-contrast Esri dark/light canvas tiles (100% free, no API keys or watermarks).
   - Click any airport marker or flight arc to view direct routes and traffic.

3. **City & Hub Explorer**:
   - Airport selector and quick hub buttons (`GUM`, `NAN`, `POM`, `PPT`, `SYD`, `LAX`, `CDG`, etc.).
   - Summary card showing total connections, outbound vs. inbound passenger split, and average ticket fare from that city compared to network averages.
   - Top connected destinations chart and direct routes table.

4. **Custom Chart Studio**:
   - Select custom X-axis dimensions, Y-axis metrics, aggregations (Sum, Average, Max, Min), and chart formats (Bar, Line, Doughnut, Pie).

5. **Route Data Table**:
   - Live search across origins, destinations, cities, and countries.
   - Multi-column sorting and pagination.
   - Export filtered or all data to **CSV** or **JSON**.

6. **Shared Local Storage (`data/` Folder) + Offline Storage**:
   - Any CSV file uploaded via the app (or placed directly in the `data/` folder) is saved permanently on disk on your machine.
   - Everyone who accesses the web server (`http://localhost:8080` or across your local network) can see, explore, and analyze the shared datasets.

---

## 🚀 How to Run the Website

### Option 1: Run Local Server (Enables Shared Disk Storage)
Run:
```powershell
python start_server.py
```
Or double-click **[`start_server.bat`](file:///C:/Users/adith_a9r1d5f/.gemini/antigravity/scratch/airline-route-analyzer/start_server.bat)**.
Then visit **`http://localhost:8080`**.

### Option 2: Direct File Open
Open **[`index.html`](file:///C:/Users/adith_a9r1d5f/.gemini/antigravity/scratch/airline-route-analyzer/index.html)** in any browser.

---

## 📁 How CSV Files are Stored Locally

1. **Automatic Disk Persistence**:
   - When you click **Add CSV** and upload a file, the Python server writes it directly to `C:\Users\adith_a9r1d5f\.gemini\antigravity\scratch\airline-route-analyzer\data\<filename>.csv`.
   - Any `.csv` file dropped directly into the `data/` folder is automatically detected and listed.
2. **Multi-User Visibility**:
   - Because datasets are saved in the `data/` folder on disk, anyone opening `http://localhost:8080` can see and switch between all stored datasets.

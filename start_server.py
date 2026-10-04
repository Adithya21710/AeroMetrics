import http.server
import socketserver
import webbrowser
import os
import sys
import json
import urllib.parse

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, "data")

if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR, exist_ok=True)

class AeroMetricsHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # API: List all CSV datasets on disk
        if parsed.path == "/api/datasets":
            self.handle_list_datasets()
            return
            
        # Fallback to standard file serving
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        
        # API: Upload and save CSV to disk
        if parsed.path == "/api/upload":
            self.handle_upload_csv()
            return

        # API: Delete CSV from disk
        if parsed.path == "/api/delete":
            self.handle_delete_csv()
            return
            
        self.send_error(404, "Endpoint not found")

    def handle_list_datasets(self):
        datasets = []
        try:
            for fname in os.listdir(DATA_DIR):
                if fname.lower().endswith(".csv") and fname.lower() != "sample_template.csv":
                    fpath = os.path.join(DATA_DIR, fname)
                    stat = os.stat(fpath)
                    try:
                        with open(fpath, "r", encoding="utf-8", errors="replace") as f:
                            content = f.read()
                            lines = [l for l in content.splitlines() if l.strip()]
                            row_count = max(0, len(lines) - 1)
                    except Exception:
                        content = ""
                        row_count = 0

                    # Look up clean display name from manifest if available
                    name_map = {}
                    manifest_path = os.path.join(DATA_DIR, "manifest.json")
                    if os.path.exists(manifest_path):
                        try:
                            with open(manifest_path, "r", encoding="utf-8") as mf:
                                m_items = json.load(mf)
                                for item in m_items:
                                    if "filename" in item and "name" in item:
                                        name_map[item["filename"]] = item["name"]
                        except Exception:
                            pass

                    is_default = (fname == "default_airline_routes.csv" or fname == "PAX_DATA_2025-26 - Indian Subcon.csv")
                    name = name_map.get(fname, fname.replace("_", " ").replace(".csv", ""))

                    datasets.append({
                        "id": "disk-" + fname,
                        "filename": fname,
                        "name": name,
                        "csvContent": content,
                        "rowCount": row_count,
                        "createdAt": stat.st_mtime * 1000,
                        "isDefault": is_default,
                        "source": "disk"
                    })
        except Exception as e:
            print("Error listing datasets:", e)

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(datasets).encode("utf-8"))

    def handle_upload_csv(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8", errors="replace")
            data = json.loads(body)

            filename = data.get("filename", "").strip()
            content = data.get("content", "")
            label = data.get("label", "").strip()

            if not filename:
                filename = (label.replace(" ", "_") if label else "airline_routes") + ".csv"
            
            if not filename.lower().endswith(".csv"):
                filename += ".csv"

            # Clean filename
            safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
            fpath = os.path.join(DATA_DIR, safe_filename)

            with open(fpath, "w", encoding="utf-8") as f:
                f.write(content)

            lines = [l for l in content.splitlines() if l.strip()]
            row_count = max(0, len(lines) - 1)

            response = {
                "success": True,
                "filename": safe_filename,
                "id": "disk-" + safe_filename,
                "name": label or safe_filename.replace("_", " ").replace(".csv", ""),
                "rowCount": row_count,
                "message": f"Saved {safe_filename} to local data folder."
            }

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(response).encode("utf-8"))
            print(f"[AeroMetrics] Saved CSV to disk: {fpath}")

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

    def handle_delete_csv(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            data = json.loads(body)
            filename = data.get("filename", "")
            
            if filename and filename != "default_airline_routes.csv":
                safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
                fpath = os.path.join(DATA_DIR, safe_filename)
                if os.path.exists(fpath):
                    os.remove(fpath)
                    print(f"[AeroMetrics] Deleted CSV from disk: {fpath}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))

def run():
    # Enable address reuse so restarts are immediate
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), AeroMetricsHandler) as httpd:
        url = f"http://localhost:{PORT}/index.html"
        print("=" * 60)
        print(" AeroMetrics — Modern Airline Network & Route Analytics")
        print("=" * 60)
        print(f" Local Web Server Running: {url}")
        print(f" Datasets Storage Folder: {DATA_DIR}")
        print(" Any uploaded CSV is stored permanently on disk for everyone.")
        print("=" * 60)
        try:
            webbrowser.open(url)
        except Exception:
            pass
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")

if __name__ == "__main__":
    run()

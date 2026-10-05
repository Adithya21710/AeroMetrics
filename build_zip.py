"""
Builds a standard POSIX-compliant ZIP archive for deployment to AWS Amplify, Azure, or static hosting.
Ensures all file paths use forward slashes (/) so Linux-based cloud web servers can resolve subdirectories.
"""
import zipfile
import os

def create_deploy_zip():
    source_dir = os.path.dirname(os.path.abspath(__file__))
    zip_path = os.path.join(source_dir, "aerometrics_deploy.zip")

    if os.path.exists(zip_path):
        os.remove(zip_path)

    print(f"Creating deployment zip at: {zip_path}")
    count = 0

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            # Exclude unwanted directories
            dirs[:] = [d for d in dirs if d not in ["__pycache__", ".git", ".idea", ".vscode"]]
            for file in sorted(files):
                if file.endswith(".zip") or file.endswith(".pyc") or file == "build_zip.py":
                    continue
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, source_dir).replace("\\", "/")
                zipf.write(abs_path, rel_path)
                count += 1
                print(f"  + {rel_path}")

    print(f"\nSuccessfully packaged {count} files into aerometrics_deploy.zip!")

if __name__ == "__main__":
    create_deploy_zip()

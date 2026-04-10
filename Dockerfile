# ─────────────────────────────────────────────
# PlaceMentor AI  –  Docker Configuration
# ─────────────────────────────────────────────

FROM python:3.10-slim

# Set working directory inside container
WORKDIR /app

# Copy requirements first (for layer caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Expose Flask port
EXPOSE 5000

# Start the Flask server
CMD ["python", "backend/app.py"]

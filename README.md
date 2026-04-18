# HUB 2.0 🎬

A modern, highly secure, full-stack video streaming platform featuring AES-128 encrypted Adaptive Bitrate (ABR) HLS playback, dynamic FFmpeg transcoding, and a sleek React frontend.

## 🚀 Local Development Setup

To run HUB 2.0 locally, you need Docker/Docker-Compose to run the backend microservices (Node.js API, FFmpeg Worker, Nginx proxy, MongoDB, Redis) and Node.js installed to run the Vite React frontend.

### Prerequisites
- [Docker](https://www.docker.com/products/docker-desktop) and Docker Compose
- [Node.js](https://nodejs.org/en) (v18 or higher)
- NPM or Yarn

### Step 1: Start the Backend Infrastructure

Open a terminal in the root directory (where `docker-compose.yml` is located) and start all the services natively:

```bash
# This builds and boots the API, FFmpeg Worker, Key Delivery, MongoDB, Redis, and Nginx.
docker-compose up -d --build
```
*Wait a few seconds for all containers to initialize. The database and Redis will automatically map to local volumes in the `./data` directory, meaning your uploads and users are persistent between restarts!*

### Step 2: Start the Web Frontend

The frontend is a dedicated Vite React application. Open a **second terminal window**, navigate to the web directory, install dependencies, and start the development server:

```bash
cd web
npm install
npm run dev
```

### Step 3: Access the Application!

Once the Vite server says "ready", your application is fully operational!
👉 **Open your browser and navigate to:** [http://localhost:3000](http://localhost:3000)

---

## 🛠 Architecture Overview

- **Web Frontend**: React.js, Vite, Video.js (Custom VHS bindings). Runs on `:3000`.
- **API Server**: Node/Express managing Authentication, Users, and Video Metadata. Runs on `:4000` (internal).
- **FFmpeg Worker**: BullMQ background worker executing H.264 ABR transcoding to AES-128 encrypted `.ts` HLS segments.
- **Nginx Edge Server**: Proxies all requests to `/api` and serves encrypted `/hls` segments with embedded authentication checks (`auth_request`). Runs on `:8080` (API & Web accesses it natively).
- **Database**: MongoDB (port 27017) and Redis (port 6379).

## 🔒 Security Features
- **Right-click / Drag blocks**: Standard OS drag-to-save patterns are disabled on the video layer.
- **Encrypted Media Extensions**: Raw video chunks are AES-encrypted so the browser memory buffer cannot be ripped easily using standard network inspection.
- **Dynamic JWT Validation**: Nginx refuses to serve `.m3u8` or `.ts` chunks to unauthenticated origins.

Happy Streaming!

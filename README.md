# FlowCapital – Full-Stack Fintech Platform

A full-stack invoice financing platform with a **Next.js frontend**, **Node.js/Express backend**, and **Python AI microservice**.

---

## 📋 Prerequisites

- **Node.js** (v18+)
- **Python** (3.10+)
- **Docker Desktop** (for PostgreSQL)

---

## 🚀 How to Run the Project

You need **3 terminals** open. Follow the steps below in order.

---

### Terminal 1 – Database (PostgreSQL via Docker)

```powershell
# First time only – create the container:
docker run --name flowcapital-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=flowcapital -p 5432:5432 -d postgres

# Every other time – just start it:
docker start flowcapital-db
```

> **Tip:** To view the database visually, run `npx prisma studio` inside `flowcapital-backend/`.

---

### Terminal 2 – Backend (Node.js API + AI Service)

```powershell
# Navigate to the backend folder
cd flowcapital-backend

# Install dependencies (first time only)
npm install

# Push the database schema (first time or after schema changes)
npx prisma db push

# Start the backend API server
npm run dev
```

The backend runs at **http://localhost:5000**

#### AI Risk Scoring Service (optional, separate terminal)

```powershell
cd flowcapital-backend/ai-service

# Create virtual env (first time only)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the AI service
python main.py
```

The AI service runs at **http://localhost:8000**

---

### Terminal 3 – Frontend (Next.js)

```powershell
# Navigate to the frontend folder
cd flowcapital

# Install dependencies (first time only)
npm install

# Start the frontend dev server
npm run dev
```

The frontend runs at **http://localhost:3000**

---

## 🔗 Service URLs Summary

| Service            | URL                        |
|--------------------|----------------------------|
| 🌐 Frontend        | http://localhost:3000       |
| ⚙️ Backend API     | http://localhost:5000       |
| 🤖 AI Service      | http://localhost:8000       |
| 🗄️ Prisma Studio   | http://localhost:5555       |
| 🐘 PostgreSQL      | localhost:5432              |

---

## 📁 Project Structure

```
myshop/
├── flowcapital/              ← Frontend (Next.js + TailwindCSS)
│   ├── src/
│   │   ├── app/              ← Pages & routing
│   │   └── components/       ← Reusable UI components
│   └── package.json
│
├── flowcapital-backend/      ← Backend (Express + Prisma + TypeScript)
│   ├── src/
│   │   ├── controllers/      ← Business logic
│   │   ├── routes/           ← API endpoints
│   │   └── server.ts         ← Entry point
│   ├── prisma/
│   │   └── schema.prisma     ← Database schema
│   ├── ai-service/           ← Python AI microservice
│   │   └── main.py
│   └── package.json
│
└── README.md                 ← You are here
```

---

## 🛑 Common Issues

| Problem | Solution |
|---------|----------|
| `Container name already in use` | Run `docker start flowcapital-db` instead of `docker run` |
| `Can't reach database at localhost:5432` | Make sure Docker Desktop is running & container is started |
| `prisma is not recognized` | Use `npx prisma ...` instead of `prisma ...` |
| `EPERM: operation not permitted` (Prisma) | Close other terminals using the backend, then retry |

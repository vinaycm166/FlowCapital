---
description: How to run the entire FlowCapital project
---

// turbo-all

Follow these steps to start all components. Each section runs in a separate terminal.

---

## 🗄️ BACKEND

### Step 1 — Start Database
```powershell
docker start flowcapital-db
```

### Step 2 — Start AI Service
```powershell
cd flowcapital-backend/ai-service
python main.py
```

### Step 3 — Start Backend API
```powershell
cd flowcapital-backend
npm run dev
```

---

## 🌐 FRONTEND

### Step 4 — Start Frontend
```powershell
cd flowcapital
npm run dev
```

---

## ✅ Verify

The system will be accessible at:
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend API: [http://localhost:5000](http://localhost:5000)
- AI Service: [http://localhost:8000](http://localhost:8000)
- Prisma Studio (optional): run `npx prisma studio` in `flowcapital-backend/`

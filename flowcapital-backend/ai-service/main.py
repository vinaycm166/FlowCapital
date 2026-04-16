from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import random

app = FastAPI(title="FlowCapital AI Risk Scoring Service")

class RiskAnalysisRequest(BaseModel):
    buyer_name: str
    invoice_amount: float
    historical_data_points: int = 0
    company_news: list[str] = []

class RiskAnalysisResponse(BaseModel):
    score: int
    category: str

@app.post("/analyze", response_model=RiskAnalysisResponse)
async def analyze_risk(request: RiskAnalysisRequest):
    # Dummy AI logic for MVP
    base_score = 60
    
    # Quantitative
    if request.invoice_amount < 10000:
        base_score += 20
    elif request.invoice_amount > 100000:
        base_score -= 15
        
    if request.historical_data_points > 5:
        base_score += 15

    # Qualitative Sentiment NLP adjustment
    sentiment_adjustment = 0
    positive_keywords = ["growth", "record", "profit", "expansion", "bullish", "award"]
    negative_keywords = ["lawsuit", "bankrupt", "loss", "crash", "fraud", "debt", "layoffs"]
    
    for news in request.company_news:
        news_lower = news.lower()
        if any(word in news_lower for word in positive_keywords):
            sentiment_adjustment += 5
        if any(word in news_lower for word in negative_keywords):
            sentiment_adjustment -= 15
        
    final_score = min(99, max(30, base_score + sentiment_adjustment + random.randint(-5, 10)))
    
    # Categorize
    if final_score >= 80:
        category = "A" # Low Risk
    elif final_score >= 60:
        category = "B" # Medium Risk
    else:
        category = "C" # High Risk
        
    return RiskAnalysisResponse(
        score=final_score,
        category=category
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

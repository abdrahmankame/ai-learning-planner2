export function validatePlanInput(body) {
    const errors = [];
    if (!body || typeof body !== "object") return ["Invalid body"];
    if (!body.skill || typeof body.skill !== "string") errors.push("skill required");
    if (!body.goal || typeof body.goal !== "string") errors.push("goal required");
    if (!["Beginner", "Intermediate", "Advanced"].includes(body.level)) errors.push("invalid level");
    if (!Number.isFinite(body.dailyMinutes) || body.dailyMinutes < 15 || body.dailyMinutes > 480) errors.push("dailyMinutes out of range");
    if (!Number.isInteger(body.daysPerWeek) || body.daysPerWeek < 1 || body.daysPerWeek > 7) errors.push("daysPerWeek out of range");
    if (!Number.isInteger(body.durationWeeks) || body.durationWeeks < 1 || body.durationWeeks > 52) errors.push("durationWeeks out of range");
    if (!["ar", "en"].includes(body.language)) errors.push("invalid language");
    return errors;
  }
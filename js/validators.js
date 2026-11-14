export function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
  export function validatePassword(pw) {
    return typeof pw === "string" && pw.length >= 6;
  }
  export function validatePlanInput(input) {
    const errors = [];
    if (!input.skill || input.skill.trim().length < 2) errors.push("المهارة مطلوبة.");
    if (!input.goal || input.goal.trim().length < 3) errors.push("الهدف مطلوب.");
    if (!["Beginner", "Intermediate", "Advanced"].includes(input.level)) errors.push("المستوى غير صالح.");
    if (!Number.isFinite(input.dailyMinutes) || input.dailyMinutes < 15 || input.dailyMinutes > 480)
      errors.push("الوقت اليومي يجب أن يكون بين 15 و480 دقيقة.");
    if (!Number.isInteger(input.daysPerWeek) || input.daysPerWeek < 1 || input.daysPerWeek > 7)
      errors.push("أيام الدراسة يجب أن تكون بين 1 و7.");
    if (!Number.isInteger(input.durationWeeks) || input.durationWeeks < 1 || input.durationWeeks > 52)
      errors.push("المدة يجب أن تكون بين 1 و52 أسبوعاً.");
    return errors;
  }
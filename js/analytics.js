export function trackEvent(name, params = {}) {
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  }
  export const events = {
    signUp: () => trackEvent("sign_up"),
    login: () => trackEvent("login"),
    onboardingCompleted: () => trackEvent("onboarding_completed"),
    planCreated: (skill) => trackEvent("plan_created", { skill }),
    lessonStarted: (lessonId) => trackEvent("lesson_started", { lessonId }),
    lessonCompleted: (lessonId) => trackEvent("lesson_completed", { lessonId }),
    quizCompleted: (score) => trackEvent("quiz_completed", { score }),
    aiTutorUsed: () => trackEvent("ai_tutor_used"),
    planUpdated: () => trackEvent("plan_updated")
  };
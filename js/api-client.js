import { getIdToken } from "./auth.js";

export async function callApi(functionName, payload = {}, method = "POST") {
  const token = await getIdToken();
  const res = await fetch(`/.netlify/functions/${functionName}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || "حدث خطأ في الخادم");
  }
  return data.data;
}
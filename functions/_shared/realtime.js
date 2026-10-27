const REALTIME_URL = "https://clinic-realtime.engabahmed.workers.dev/publish";

export async function publishClinicRealtime(env, event) {
  const secret = env.CLINIC_REALTIME_PUBLISH_SECRET;
  if (!secret || !REALTIME_URL) return;
  try {
    const response = await fetch(REALTIME_URL, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ event })
    });
    if (!response.ok) {
      console.warn("Clinic realtime publish unavailable:", response.status);
    }
  } catch (error) {
    console.warn("Clinic realtime publish failed:", error?.message || "network");
  }
}

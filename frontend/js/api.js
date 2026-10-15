export function createApi(getState) {
  return async function api(route, { method = "GET", body, raw = false } = {}) {
    const state = getState();
    const headers = {};
    if (state.user) {
      const token = state.config.demo
        ? "local-demo"
        : await state.user.getIdToken();
      headers.Authorization = "Bearer " + token;
    }
    if (body && !(body instanceof FormData))
      headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await fetch("/api" + route, {
        method,
        headers,
        body:
          body instanceof FormData
            ? body
            : body
              ? JSON.stringify(body)
              : undefined,
      });
    } catch {
      throw Error("Connexion interrompue. Vérifiez votre réseau et réessayez.");
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const e = Error(data.error || "Le service est indisponible. Réessayez.");
      e.status = response.status;
      throw e;
    }
    if (response.status === 204) return null;
    return raw ? response.blob() : response.json();
  };
}

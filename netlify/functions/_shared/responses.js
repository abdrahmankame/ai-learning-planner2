export function success(data) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, data, error: null })
    };
  }
  export function failure(code, message, statusCode = 400) {
    return {
      statusCode,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, data: null, error: { code, message } })
    };
  }
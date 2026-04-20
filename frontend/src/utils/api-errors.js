export const extractApiErrorMessage = (error, fallbackMessage) => {
  // 1. Check for response from backend
  if (error?.response) {
    const message = error.response.data?.message;

    if (Array.isArray(message) && message.length > 0) {
      return message[0];
    }

    if (typeof message === "string" && message.trim()) {
      return message;
    }

    // Handle generic status code errors if no message is present
    if (error.response.status === 401) return "Unauthorized: Please login again.";
    if (error.response.status === 403) return "Forbidden: You don't have permission.";
    if (error.response.status === 404) return "Resource not found.";
    if (error.response.status >= 500) return "Global server error. Please try again later.";
  }

  // 2. Check for request made but no response (Network error)
  if (error?.request) {
    return "Network error: Unable to reach the server. Please check your internet connection.";
  }

  // 3. Something happened in setting up the request
  if (error?.message) {
    return error.message;
  }

  return fallbackMessage || "An unexpected error occurred.";
};


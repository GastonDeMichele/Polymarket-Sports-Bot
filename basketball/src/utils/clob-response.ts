export interface ClobApiErrorInfo {
  status?: number;
  message: string;
}

export function getClobApiError(response: unknown): ClobApiErrorInfo | null {
  if (response == null) return null;

  if (typeof response === "object" && response !== null) {
    const data = response as {
      error?: string | { message?: string };
      message?: string;
      status?: number;
      response?: { status?: number; data?: { error?: string; message?: string } };
    };

    if (typeof data.error === "string") {
      return { status: data.status, message: data.error };
    }
    if (typeof data.error === "object" && data.error?.message) {
      return { status: data.status, message: data.error.message };
    }
    if (data.response?.data?.error) {
      return { status: data.response.status, message: data.response.data.error };
    }
    if (data.response?.data?.message) {
      return { status: data.response.status, message: data.response.data.message };
    }
    if (typeof data.message === "string" && /error|failed|unauthorized|denied/i.test(data.message)) {
      return { status: data.status, message: data.message };
    }
  }

  return null;
}

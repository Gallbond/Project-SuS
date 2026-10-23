/** Ошибка, которую можно безопасно показать пользователю. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

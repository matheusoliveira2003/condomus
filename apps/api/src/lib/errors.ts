/** Erro com status HTTP, tratado pelo error handler global em app.ts. */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const naoEncontrado = (recurso: string, genero: "m" | "f" = "m") =>
  new HttpError(404, `${recurso} não encontrad${genero === "f" ? "a" : "o"}`);
export const proibido = () => new HttpError(403, "Acesso negado para este perfil");

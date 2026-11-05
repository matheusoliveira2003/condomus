import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O env é lido na importação do módulo: define a chave antes e importa o módulo depois.
process.env.RESEND_API_KEY = "re_chave_de_teste";

const { enviarBoasVindas, enviarCodigoRecuperacao, enviarCodigoTrocaEmail, saudacaoNome } = await import("../src/lib/email.js");

const fetchFalso = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  fetchFalso.mockClear();
  vi.stubGlobal("fetch", fetchFalso);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/** Corpo JSON da última chamada ao Resend. */
function ultimoEnvio(): { to: string; subject: string; html: string; attachments?: { content_id?: string; filename?: string }[] } {
  const chamada = fetchFalso.mock.calls.at(-1) as unknown as [string, { body: string }];
  return JSON.parse(chamada[1].body);
}

describe("saudação nos e-mails", () => {
  it("usa só o primeiro nome", () => {
    expect(saudacaoNome("Matheus Paulo Oliveira")).toBe("Matheus");
    expect(saudacaoNome("  Gabriel   Ramos ")).toBe("Gabriel");
    expect(saudacaoNome("Ana")).toBe("Ana");
  });

  it("escapa HTML do nome", () => {
    expect(saudacaoNome('<script>alert("x")</script> Silva')).not.toContain("<");
    expect(saudacaoNome("D'Ávila Neto")).not.toContain("'");
  });

  it("e-mail de recuperação: 'Olá, Matheus' sem sobrenome nem exclamação", async () => {
    enviarCodigoRecuperacao("a@b.com", "Matheus Paulo Oliveira", "123456");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const { html } = ultimoEnvio();
    expect(html).toContain("Olá, Matheus<");
    expect(html).not.toContain("Paulo");
    expect(html).not.toContain("Olá, Matheus!");
    expect(html).toContain("123456");
  });

  it("e-mail de boas-vindas: primeiro nome e senha temporária", async () => {
    enviarBoasVindas("gabriel@b.com", "Gabriel Lima Ramos", "Abc123");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const { html } = ultimoEnvio();
    expect(html).toContain("Olá, Gabriel<");
    expect(html).not.toContain("Ramos");
    expect(html).toContain("Abc123");
  });

  it("e-mail de troca de e-mail: primeiro nome", async () => {
    enviarCodigoTrocaEmail("novo@b.com", "Maria Souza", "654321");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const { html } = ultimoEnvio();
    expect(html).toContain("Olá, Maria<");
    expect(html).not.toContain("Souza");
  });
});

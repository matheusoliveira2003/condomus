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

  it("todos os e-mails levam o logo inline (cid) e o anexo correspondente", async () => {
    enviarCodigoRecuperacao("a@b.com", "Matheus", "123456");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(1));
    enviarBoasVindas("a@b.com", "Matheus", "Abc123");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(2));
    enviarCodigoTrocaEmail("a@b.com", "Matheus", "654321");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalledTimes(3));

    for (const [, init] of fetchFalso.mock.calls as unknown as [string, { body: string }][]) {
      const corpo = JSON.parse(init.body) as { html: string; attachments?: { content_id?: string; content?: string; content_type?: string }[] };
      const anexo = corpo.attachments?.[0];
      expect(anexo?.content_id).toBeTruthy();
      expect(anexo?.content_type).toBe("image/png");
      expect(corpo.html).toContain(`src="cid:${anexo?.content_id}"`);
      // PNG de verdade: assinatura \x89PNG em base64 começa com "iVBORw0KGgo"
      expect(anexo?.content?.startsWith("iVBORw0KGgo")).toBe(true);
    }
  });

  it("e-mail de troca de e-mail: primeiro nome", async () => {
    enviarCodigoTrocaEmail("novo@b.com", "Maria Souza", "654321");
    await vi.waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const { html } = ultimoEnvio();
    expect(html).toContain("Olá, Maria<");
    expect(html).not.toContain("Souza");
  });
});

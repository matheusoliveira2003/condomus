# Condomus

Plataforma SaaS para gerenciamento de condomínios residenciais. Cada condomínio é um tenant isolado que contrata um plano para liberar o acesso dos moradores e funcionários. A plataforma centraliza controle de visitantes, encomendas, comunicados e reservas de áreas comuns, com acesso diferenciado para moradores, portaria e síndico.

## Estrutura

```
apps/
  api/        API REST — Node.js, TypeScript, Fastify, Prisma, PostgreSQL
  mobile/     Aplicativo — React Native (Expo), TypeScript
packages/
  types/      Tipos de domínio compartilhados entre api e mobile
docs/         Requisitos, regras de acesso e modelo de dados
```

## Modelo de negócio

```
Ops/você
  POST /admin/condominios   →  cria o condomínio + conta do síndico + define o plano

Síndico (via app)
  Cadastra unidades (bloco/número)
  "Gerar convite" em cada unidade  →  código de 8 chars, válido por 7 dias

Morador (tela "Criar conta")
  Digita o código  →  confirma "Bloco A-101 · Condomínio XYZ"
  Preenche nome, e-mail, senha  →  entra direto no app

Portaria e demais usuários
  Cadastrados diretamente pelo síndico na tela de Cadastros
```

### Planos

| Status   | Comportamento |
|----------|---------------|
| `TRIAL`  | Acesso total (período gratuito) |
| `ATIVO`  | Acesso total |
| `EXPIRADO` / `SUSPENSO` | Morador e porteiro recebem **402** em todas as rotas. Síndico mantém acesso para ver o status e contatar suporte. |

O plano é atualizado via `PATCH /admin/condominios/:id/plano` protegido por `ADMIN_SECRET`.

---

## Como rodar

**Pré-requisitos:** Node.js 20+ e PostgreSQL 16.

```bash
brew install postgresql@16   # se ainda não tiver o Postgres instalado
npm install                  # instala dependências de todos os pacotes

npm run db:up                # inicia o PostgreSQL (brew services start postgresql@16)

# Uma vez só: cria o usuário e o banco de desenvolvimento.
createuser condomus --superuser
createdb condomus --owner=condomus
psql postgres -c "ALTER USER condomus WITH PASSWORD 'condomus';"

npm run db:migrate           # cria/atualiza as tabelas
npm run db:seed              # cria o condomínio demo e os usuários de exemplo

npm run dev:api              # API em http://localhost:3333
npm run dev:mobile           # app Expo (abra no Expo Go ou em um emulador)
```

No celular físico, defina `EXPO_PUBLIC_API_URL=http://<IP-da-sua-máquina>:3333` antes de iniciar o app.

### Variáveis de ambiente (`apps/api/.env`)

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | ✅ | URL do PostgreSQL |
| `JWT_SECRET` | ✅ | Segredo para assinar os tokens JWT |
| `ADMIN_SECRET` | ✅ | Segredo das rotas `/admin/*` (mín. 16 chars) |
| `RESEND_API_KEY` | — | Chave do [Resend](https://resend.com) para envio de e-mail de recuperação de senha |
| `STORAGE_BUCKET` | — | Bucket S3/R2/MinIO para fotos de perfil |
| `STORAGE_ENDPOINT` | — | Endpoint do storage (para Cloudflare R2, MinIO etc.) |
| `STORAGE_ACCESS_KEY_ID` | — | Access key do storage |
| `STORAGE_SECRET_ACCESS_KEY` | — | Secret key do storage |

Sem `RESEND_API_KEY`, o código de recuperação aparece só no log. Sem `STORAGE_BUCKET`, as rotas de foto retornam 503.

---

## Testes automatizados

```bash
npm test        # roda todos os testes da API (requer PostgreSQL ligado)
```

Os testes usam o banco `condomus_teste` (criado automaticamente); o banco de desenvolvimento nunca é tocado. Notificações push são simuladas — nada é enviado ao Expo.

### Cobertura por arquivo

| Arquivo de teste | O que cobre |
|-----------------|-------------|
| `auth.test.ts` | Login, permissões por perfil, troca/recuperação de senha, invalidação de token, enforcement do plano (402) |
| `convites.test.ts` | Geração de convite, substituição do anterior, consulta pública, cadastro por convite, uso duplo/expirado/inválido |
| `condominios.test.ts` | Rotas admin (criar/alterar plano), `GET /condominios/meu`, enforcement 402, isolamento entre tenants |
| `visitas.test.ts` | Ciclo agendada→entrada→saída, convite QR code, entrada direta, cancelamento, histórico, paginação |
| `encomendas-avisos.test.ts` | Registro/retirada, filtro por status, paginação por cursor, avisos fixados, resumo do Início |
| `reservas.test.ts` | Conflito de horário, advisory lock, aprovação/recusa/cancelamento, disponibilidade, filtro por status |
| `cadastros-fotos.test.ts` | CRUD de usuários/unidades, desativação de conta, upload/remoção de foto |
| `notificacoes.test.ts` | Push para unidade/papel/todos, limpeza de tokens inválidos, desvinculação no logout |

---

## Usuários de exemplo (senha `123456`)

Criados pelo `db:seed` no condomínio **Condomínio Demo**:

| Perfil   | Nome                       | E-mail                  |
|----------|----------------------------|-------------------------|
| Síndico  | Matheus Paulo Oliveira     | matheuspo@condomus.dev  |
| Morador  | Gabriel Lopes Ramos (A-101) | gabriellr@condomus.dev |
| Portaria | Nathan Martinez Lazarete   | nathanml@condomus.dev   |

---

## Endpoints principais

### Públicos (sem autenticação)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/login` | Login — devolve JWT + dados do usuário |
| POST | `/auth/recuperar-senha` | Pede código de recuperação por e-mail |
| POST | `/auth/redefinir-senha` | Redefine a senha com o código recebido |
| GET  | `/convite/:codigo` | Consulta um convite de unidade (mostra condomínio e bloco/número) |
| POST | `/cadastro` | Cadastro de morador por convite — devolve sessão imediatamente |

### Autenticadas (todos os perfis)
| Método | Rota | Descrição |
|--------|------|-----------|
| GET  | `/auth/me` | Dados do usuário logado |
| PATCH | `/auth/senha` | Troca a própria senha |
| PUT/DELETE | `/auth/foto` | Enviar/remover foto de perfil |
| GET  | `/condominios/meu` | Dados e status do plano do condomínio |

### Admin (requer `Authorization: Bearer <ADMIN_SECRET>`)
| Método | Rota | Descrição |
|--------|------|-----------|
| POST  | `/admin/condominios` | Cria condomínio + síndico inicial |
| PATCH | `/admin/condominios/:id/plano` | Atualiza planoStatus e planoExpiraEm |

---

## Notificações push (Android)

O Expo Go no Android não recebe push. Para testá-las, gere um *development build*:

1. Coloque o `google-services.json` do Firebase em `apps/mobile/` e envie-o ao EAS:
   ```
   npx eas-cli env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json \
     --visibility secret --environment development --environment preview --environment production
   ```
2. Em `apps/mobile`, rode `npx eas-cli build --profile development --platform android` e instale o APK.
3. Inicie com `npm run dev:mobile` e abra o app Condomus (não o Expo Go).

---

Mais detalhes em [docs/requisitos.md](docs/requisitos.md).

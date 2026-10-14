# Condomus

Aplicativo para gerenciamento de condomínios residenciais. Centraliza em uma única plataforma o controle de visitantes, encomendas, comunicados e reservas de áreas comuns, com acesso diferenciado para moradores, portaria e síndico.

## Estrutura

```
apps/
  api/      API REST — Node.js, TypeScript, Fastify, Prisma, PostgreSQL
  mobile/   Aplicativo — React Native (Expo), TypeScript
docs/       Requisitos, regras de acesso e modelo de dados
```

## Como rodar

Pré-requisitos: Node.js 20+ e PostgreSQL 16 (via Docker ou instalado localmente).

```bash
npm install                 # instala dependências de todos os pacotes

npm run db:up               # sobe o PostgreSQL com Docker (ou use um Postgres local
                            # e ajuste DATABASE_URL em apps/api/.env)
npm run db:migrate          # cria as tabelas
npm run db:seed             # cria usuários e áreas de exemplo

npm run dev:api             # API em http://localhost:3333
npm run dev:mobile          # app Expo (abra no Expo Go ou em um emulador)
```

No celular físico, defina `EXPO_PUBLIC_API_URL=http://<IP-da-sua-máquina>:3333` antes de iniciar o app.

### Usuários de exemplo (senha `123456`)

| Perfil   | E-mail                  |
|----------|-------------------------|
| Morador  | morador@condomus.dev    |
| Portaria | portaria@condomus.dev   |
| Síndico  | sindico@condomus.dev    |

Mais detalhes em [docs/requisitos.md](docs/requisitos.md).

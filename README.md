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

### Notificações push (Android)

O Expo Go no Android não recebe notificações push. Para testá-las, gere um *development build* (um app Condomus próprio, instalado no lugar do Expo Go):

1. Coloque o `google-services.json` do Firebase em `apps/mobile/` (ele não é versionado) e, dentro de `apps/mobile`, envie-o ao EAS como variável secreta:
   `npx eas-cli env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development --environment preview --environment production`
   Envie também a chave FCM V1 (`npx eas-cli credentials`).
2. Em `apps/mobile`, rode `npx eas-cli build --profile development --platform android` e instale o APK gerado.
3. Inicie o servidor com `npm run dev:mobile` e abra o app Condomus (não o Expo Go).

O celular é registrado ao fazer login; a API avisa os moradores da unidade quando a portaria registra uma encomenda ou a entrada de um visitante.

### Usuários de exemplo (senha `123456`)

| Perfil   | Nome                     | E-mail                  |
|----------|--------------------------|-------------------------|
| Síndico  | Matheus Paulo Oliveira   | matheuspo@condomus.dev  |
| Morador  | Gabriel Lopes Ramos (A-101) | gabriellr@condomus.dev |
| Portaria | Nathan Martinez Lazarete | nathanml@condomus.dev   |

Mais detalhes em [docs/requisitos.md](docs/requisitos.md).

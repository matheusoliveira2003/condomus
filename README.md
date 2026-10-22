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

Pré-requisitos: Node.js 20+ e PostgreSQL 16 (via Homebrew; use um Postgres já instalado de outra forma se preferir, ajustando `DATABASE_URL`).

```bash
brew install postgresql@16  # uma vez só, se ainda não tiver o Postgres instalado
npm install                 # instala dependências de todos os pacotes

npm run db:up               # inicia o PostgreSQL (brew services start postgresql@16)

# Uma vez só: cria o usuário e o banco usados em apps/api/.env (DATABASE_URL).
# A senha abaixo é só para a URL de conexão funcionar — o Postgres do Homebrew
# usa autenticação "trust" para conexões locais, então ela não é checada de fato.
createuser condomus --superuser
createdb condomus --owner=condomus
psql postgres -c "ALTER USER condomus WITH PASSWORD 'condomus';"

npm run db:migrate          # cria as tabelas
npm run db:seed             # cria usuários e áreas de exemplo

npm run dev:api             # API em http://localhost:3333
npm run dev:mobile          # app Expo (abra no Expo Go ou em um emulador)
```

No celular físico, defina `EXPO_PUBLIC_API_URL=http://<IP-da-sua-máquina>:3333` antes de iniciar o app.

### Testes automatizados

```bash
npm test        # roda os testes da API (com o PostgreSQL ligado)
```

Os testes chamam a API sem rede (Fastify `inject`) e usam um banco separado, `condomus_teste`, criado e migrado automaticamente — o banco de desenvolvimento nunca é tocado (há uma trava que só permite limpar bancos terminados em `_teste`). Notificações push são simuladas: nada é enviado ao Expo. Cobrem login e permissões de cada perfil, visitas e convites com QR code, encomendas, reservas (conflito de horário e aprovação), avisos, resumo do Início, cadastros, fotos de perfil e notificações.

### Notificações push (Android)

O Expo Go no Android não recebe notificações push. Para testá-las, gere um *development build* (um app Condomus próprio, instalado no lugar do Expo Go):

1. Coloque o `google-services.json` do Firebase em `apps/mobile/` (ele não é versionado) e, dentro de `apps/mobile`, envie-o ao EAS como variável secreta:
   `npx eas-cli env:set --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment development --environment preview --environment production`
   Envie também a chave FCM V1 (`npx eas-cli credentials`).
2. Em `apps/mobile`, rode `npx eas-cli build --profile development --platform android` e instale o APK gerado.
3. Inicie o servidor com `npm run dev:mobile` e abra o app Condomus (não o Expo Go).

O celular é registrado ao fazer login; a API avisa os moradores da unidade quando a portaria registra uma encomenda ou a entrada de um visitante.

### Recuperação de senha

O fluxo "Esqueci minha senha" (pede um código por e-mail, depois redefine) funciona sem nenhuma configuração extra: sem a chave do Resend, o código só fica registrado no log da API em vez de ser enviado por e-mail. Para o envio de verdade:

1. Crie uma conta gratuita em [resend.com](https://resend.com) e gere uma API key.
2. Adicione `RESEND_API_KEY="sua-chave"` em `apps/api/.env` (nunca versionado).
3. Em conta nova, sem domínio verificado, o Resend só entrega e-mails para o endereço da própria conta (modo sandbox) — suficiente para testar o fluxo.

### Usuários de exemplo (senha `123456`)

| Perfil   | Nome                     | E-mail                  |
|----------|--------------------------|-------------------------|
| Síndico  | Matheus Paulo Oliveira   | matheuspo@condomus.dev  |
| Morador  | Gabriel Lopes Ramos (A-101) | gabriellr@condomus.dev |
| Portaria | Nathan Martinez Lazarete | nathanml@condomus.dev   |

Mais detalhes em [docs/requisitos.md](docs/requisitos.md).

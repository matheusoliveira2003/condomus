---
name: commitar
description: Faz o commit do trabalho pronto no Condomus, no momento certo. Use quando uma unidade de trabalho for concluída e verificada (feature, correção, etapa de um plano, ajuste visual aprovado), antes de começar outra tarefa ou trocar de branch, e antes de mudanças arriscadas (migrations, atualização de dependências). Também quando o usuário pedir "commita", "salva isso" ou "fecha essa etapa". Não use no meio de uma tarefa, com testes falhando ou enquanto o usuário ainda está ajustando.
---

# Commitar no Condomus

O usuário autorizou commits **locais** no fim de cada unidade de trabalho concluída, sem pedir confirmação a cada um. **Push não está incluído**: só com pedido explícito (ver "Push").

## Quando commitar

Commite quando **todas** as condições valerem:

1. **A unidade está completa.** Uma feature, uma correção, uma etapa de plano, um ajuste visual que o usuário aprovou. Não commite meio caminho.
2. **Foi verificada** (ver "Verificar antes").
3. **O usuário não está iterando.** Em ajuste visual ou de texto, espere ele dizer que gostou, ou que seguimos. Ele já rejeitou visuais; um commit prematuro vira ruído no histórico.
4. **As mudanças são de um assunto só**, ou dá para separá-las (ver "Separar").

Commite também, mesmo sem a unidade terminada, antes de:
- começar uma tarefa de outro assunto com a árvore suja;
- trocar de branch;
- uma mudança arriscada (migration, atualização de dependência, `npm ci`), para ter um ponto de volta.

Não commite quando: os testes ou o typecheck falham, há erro conhecido que você ainda vai corrigir, a árvore tem arquivos que você não reconhece (pergunte), ou o usuário disse para esperar.

## Verificar antes

Rode só o que a mudança toca, a partir da raiz:

| Tocou em | Rode |
|---|---|
| `apps/api` | `npm run typecheck -w @condomus/api` e `npm test` (precisa do PostgreSQL ligado; `npm run db:up`) |
| `apps/mobile` ou `packages/types` | `npm run typecheck` |
| só README, `docs/` ou `.claude/` | nada |

Se uma verificação falhar, corrija ou avise o usuário. Nunca commite por cima de uma falha, e nunca use `--no-verify`.

## Branch

O fluxo é `develop` → `main` (e `staging` no futuro). Commite na **`develop`** ou em uma branch curta criada a partir dela (`feature/...`, `fix/...`).

Se estiver na `main`, **não commite**: ela é a produção e só recebe pull request. Troque para a `develop` (`git switch develop`) se a árvore estiver limpa; se não estiver, avise o usuário antes de mexer.

## Separar

Rode `git status --short` e `git diff --stat` e agrupe por assunto. Se houver dois assuntos (ex.: uma feature e um ajuste de README sem relação), faça **um commit por assunto**. Um commit deve ser revertível sozinho.

Adicione sempre **por caminho**, nunca com `git add -A` ou `git add .`:

```bash
git add apps/api/src/modules/usuarios/routes.ts apps/api/tests/cadastros-fotos.test.ts
```

Antes de adicionar, confira que não entra:
- `.env`, `google-services.json`, `*firebase-adminsdk*.json`, `service-account*.json` (já estão no `.gitignore`, mas confira o `git status`);
- chaves, tokens e senhas no diff. O hook do repositório (Block Secrets) também escaneia, mas não dependa só dele;
- arquivos gerados (`dist/`, `.expo/`) e `package-lock.json` sem mudança de dependência correspondente.

Mudou dependência? Inclua o `package.json` e o `package-lock.json` no mesmo commit.

## Mensagem

Em português, no padrão recente do repositório: `Área: o que mudou`, no passado ou no substantivo, sem ponto final, até ~70 caracteres no título.

```
Cadastros: senha temporária por e-mail, reenvio e selo "Aguardando acesso"
API pronta para o Railway: prisma em produção, start sem .env, README de deploy
Avisos: alfinete vermelho nos avisos fixados
```

- A área é o módulo ou a tela: `Avisos`, `Cadastros`, `Login`, `API`, `App`, `Reservas`.
- Descreva o **porquê** quando não for óbvio. Corpo opcional, em lista curta, para o que o título não cobre.
- Termine sempre com a linha de coautoria, depois de uma linha em branco:

```
Co-Authored-By: Claude Code <noreply@anthropic.com>
```

Use heredoc para a mensagem de várias linhas:

```bash
git commit -m "$(cat <<'EOF'
Área: título

- ponto 1
- ponto 2

Co-Authored-By: Claude Code <noreply@anthropic.com>
EOF
)"
```

## Depois do commit

Rode `git status --short` e `git log -1 --oneline` para confirmar que a árvore ficou como esperado, e diga ao usuário, em uma ou duas linhas: o hash, o título e se sobrou algo fora do commit.

## Push

**Não faça push sozinho.** Envia código para fora do computador e dispara o Railway quando a branch é a de produção. Ao fim de um conjunto de commits, diga quantos ficaram à frente do remoto (`git status -sb`) e pergunte se o usuário quer enviar.

Com o pedido explícito: `git push` na `develop`. Na `main`, só por pull request (`gh pr create --base main --head develop`), nunca push direto.

## Nunca

- `git commit --amend`, `rebase`, `reset --hard` ou `push --force` em commit já enviado, sem o usuário pedir.
- `--no-verify`, ou qualquer forma de pular o scan de segredos.
- Commitar na `main`.
- Commitar arquivos que você não consegue explicar.

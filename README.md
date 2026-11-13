# Barbearia — jogo de gestão em equipe

Jogo web multiplayer para sala de aula (jovens aprendizes, 16–22 anos). Cada sala é uma
empresa: uma barbearia com até 10 jogadores, cada um com um cargo (Gerente, Financeiro,
Compras/Estoque, Barbeiro). Pratica estoque, precificação, fluxo de caixa, empréstimo com
juros e trabalho em equipe.

- Servidor: Node.js + Express + Socket.IO (o servidor calcula tudo; o navegador só mostra).
- Navegador: HTML + JavaScript puro + Canvas 2D. Todos os gráficos são desenhados por código.
- Sem banco de dados: cada sala é salva em `data/salas/<CÓDIGO>.json` a cada 30 s e no fim do dia.
- Dinheiro: moeda **rede** (ʀ$), 1 rede = 100 **cidadãos**. Internamente tudo é inteiro em cidadãos.

---

## 1. Rodar no computador do instrutor

Precisa do **Node.js 18 ou mais novo** (https://nodejs.org, versão LTS).

```bash
npm install
npm start
```

Abra http://localhost:3000. Para usar outra porta: `PORT=8080 npm start`
(no Windows/PowerShell: `$env:PORT=8080; npm start`).

Ao iniciar, o terminal mostra os endereços para os alunos, por exemplo:

```
  Barbearia rodando!  Neste computador: http://localhost:3000
  Alunos na rede local:  http://192.168.0.15:3000
```

Para parar, aperte `Ctrl+C` (as salas são salvas antes de sair).

## 2. Como os alunos entram (rede local)

1. O computador do instrutor e os dos alunos (ou celulares) precisam estar **na mesma rede Wi-Fi/cabo**.
2. Os alunos abrem no navegador o endereço mostrado no terminal: `http://IP-DO-INSTRUTOR:3000`.
   - Para descobrir o IP manualmente: Windows → `ipconfig` (campo "Endereço IPv4"); Mac/Linux → `ifconfig` ou `ip addr`.
3. Se não abrir, o firewall do computador do instrutor está bloqueando. No Windows, na primeira vez
   que rodar `npm start` aparece um aviso do Firewall: marque **Redes privadas** e clique em Permitir.
   Redes de escola às vezes isolam os aparelhos entre si; nesse caso use um roteador próprio ou o
   celular como roteador, ou publique no Render (seção 3).

### Começando uma aula

1. Instrutor: na tela inicial, em **Criar empresa**, digite uma senha (mínimo 4 caracteres). Aparece o
   **código de 5 letras** em destaque. O link `http://IP:3000/?sala=CÓDIGO` já preenche o código.
2. Alunos: **Entrar com código** → nome (2 a 16 letras) → montam o personagem → escolhem o cargo.
   Vagas: Gerente 1, Financeiro 2, Compras/Estoque 2, Barbeiro 6. Máximo 10 pessoas; a 11ª vê "Empresa lotada".
3. Quem criou a sala tem o botão **Instrutor**. Outra máquina pode entrar só para observar (projetor):
   na tela inicial, "Entrar como instrutor (só observar)" com código + senha. Observador não ocupa vaga.
4. Qualquer jogador pode liberar o painel do instrutor em **Equipe → Instrutor** digitando a senha.

Cada aba do navegador é um jogador. Recarregar a página volta como o mesmo jogador.
Se ninguém estiver conectado à sala, o tempo do jogo fica parado.

### Painel do instrutor
- Pausar / retomar, velocidade 1×, 2×, 4× (acelera tudo: relógio, atendimentos, paciência).
- Duração do dia: 5 a 20 minutos reais (padrão 10).
- Pular a noite (resumo do dia).
- Reiniciar a empresa do zero (os jogadores continuam na sala).
- Exportar CSV (abre no Excel/LibreOffice): **log de ações**, **resumo diário** e **extrato**.
  Também por URL: `/api/salas/CÓDIGO/log.csv?senha=SENHA` (e `resumo.csv`, `extrato.csv`).

## 3. Publicar de graça no Render.com

1. Crie uma conta gratuita no GitHub e envie esta pasta para um repositório
   (no site do GitHub: **New repository** → depois "uploading an existing file", ou use o Git).
   Não envie a pasta `node_modules` (o `.gitignore` já cuida disso).
2. Crie uma conta em https://render.com (pode entrar com o GitHub).
3. No painel do Render: **New +** → **Web Service** → escolha o repositório.
4. Preencha:
   - **Runtime/Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
   (Não precisa configurar `PORT`: o Render define sozinho e o jogo lê a variável.)
5. Clique em **Create Web Service** e espere o deploy terminar. O endereço será algo como
   `https://barbearia-xxxx.onrender.com` — é esse que os alunos abrem.

**Limitações do plano gratuito do Render (importante):**
- O serviço "dorme" depois de uns 15 minutos sem acesso; a primeira abertura depois disso demora
  cerca de 1 minuto. Abra o link uns minutos antes da aula.
- O disco é temporário: quando o serviço dorme, reinicia ou é publicado de novo, **as salas salvas
  se perdem**. Para uma partida de várias aulas, prefira rodar na rede local (seção 2) ou contratar
  um disco persistente no Render e apontar a variável `PASTA_DADOS` para ele.

## 4. Como se joga (resumo para os alunos)

- **Gerente:** abre/fecha a loja, define preços dos serviços e produtos, renomeia a loja, aprova empréstimos,
  contrata barbeiro NPC (só quando não há Barbeiro jogador online) e decide quando **ampliar a barbearia**.
- **Compras/Estoque:** compra móveis, ferramentas e produtos; usa **Construir** para arrastar móveis para a loja
  (tecla **R** gira); expõe produtos na prateleira; vende usados.
- **Financeiro:** pede empréstimos (o Gerente aprova; sem Gerente online, aprova sozinho), paga ou quita, vê o extrato.
- **Barbeiro:** clica num cliente da fila (no mapa ou no painel "Fila de espera") e depois numa cadeira livre.
  Pode "Sugerir produto" durante o atendimento.
- Para abrir é preciso: 1 cadeira, 1 espelho, 1 tesoura ou máquina e 1 balcão.
- **O espelho vai na frente da cadeira, virado para ela.** A cadeira "olha" para um lado (gire com **R**); no modo
  Construir, um quadrado azul mostra onde o espelho tem que ficar. Espelho ao lado, atrás ou virado para outro lado
  não vale: a cadeira aparece com "SEM ESPELHO" e não atende. O barbeiro trabalha ao lado da cadeira.
- **Ampliar a barbearia (Loja → Tamanho da barbearia):** o salão começa com 10×8 e cabem 3 cadeiras.
  | Nível | Área | Obra (à vista) | Aluguel por dia | Cadeiras | Lugares em pé | Movimento na calçada |
  |---|---|---|---|---|---|---|
  | 1 | Salão original (10×8) | — | ʀ$ 80,00 | 3 | 3 | — |
  | 2 | Anexo lateral, onde era o jardim (13×8) | ʀ$ 2.000,00 | ʀ$ 105,00 | 5 | 5 | +10% |
  | 3 | Salão dos fundos (13×10) | ʀ$ 3.500,00 | ʀ$ 120,00 | 7 | 7 | +20% |

  Cadeiras e espelhos novos são comprados à parte. A obra só acontece sem atendimento em andamento.
  Pergunta para a turma: em quantos dias o lucro extra paga a obra e o aluguel mais caro?
- O dia vai das 07:00 às 21:00. À noite aparece o resumo (faturamento, custos, lucro, clientes perdidos e por quê).
- Caixa negativo por 3 dias seguidos = falência.

## 5. Testes

```bash
npm test          # testes automáticos: juros, quitação antecipada, atraso/multa, variação de preços, moeda, permissões
npm run simular   # simula 7 dias com robôs (razoável, descuidada, com e sem ampliação) e imprime o resultado
```

Teste de permissão pelo console do navegador (F12), logado como Barbeiro:

```js
socket.emit('acao', { tipo: 'renomearLoja', nome: 'Hackeada' }, console.log)
// { ok: false, erro: 'Só o Gerente pode fazer isso' }
socket.emit('acao', { tipo: 'solicitarEmprestimo', valor: 100000, prazo: 7 }, console.log)
// { ok: false, erro: 'Só o Financeiro pode fazer isso' }
```

## 6. Ajustar o balanceamento

Todos os números do jogo (preços, durabilidades, durações, demanda de clientes, custos fixos,
juros, multa, mora, eventos, elasticidade, reputação, ampliação) ficam em **`config/economia.js`**,
comentados. Mude, reinicie o servidor e rode `npm run simular` para ver o efeito.

## 7. Estrutura

```
config/economia.js   parâmetros de balanceamento
shared/              código usado pelo servidor e pelo navegador (moeda, mapa/A*, permissões)
server/              index (HTTP + Socket.IO + laço 10 Hz), sala (simulação), banco, mercado, persistência, CSV, filtro
public/              index.html, css, js (render isométrico, sprites procedurais, interface), fonte Press Start 2P (OFL)
test/                testes (node:test)
scripts/simular.js   simulador de balanceamento
data/salas/          salas salvas (criada automaticamente)
```

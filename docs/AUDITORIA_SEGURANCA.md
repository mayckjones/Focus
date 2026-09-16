# Auditoria de segurança do Focus

Data da revisão: 16 de setembro de 2026.

## Conclusão

O Focus está adequado para uma aplicação pessoal estática, mas não deve ser descrito
como "100% seguro". A autenticação e a autorização dependem da configuração correta
do Supabase. O risco mais grave encontrado era de integridade dos dados: estados
inteiros eram gravados com estratégia de "última gravação vence", as chaves locais
eram compartilhadas entre contas e uma leitura de nuvem com falha podia ser seguida
por um envio automático da cópia local.

Esses caminhos foram corrigidos no cliente. A proteção durável de histórico só passa
a existir no servidor depois que `database/supabase.sql` for executado no projeto
Supabase.

## Riscos corrigidos

### Integridade e perda de dados

- O `localStorage` agora usa chaves separadas pelo UUID do usuário.
- Temporizadores de gravação são cancelados quando a conta ativa muda.
- Cada gravação fica vinculada ao usuário que a iniciou.
- Gravações na nuvem são serializadas para não terminarem fora de ordem.
- A atualização compara o `updated_at` conhecido; uma aba antiga não substitui
  silenciosamente uma versão mais nova.
- Falha ao ler a nuvem usa a cópia local, mas não a reenvia automaticamente.
- Cinco versões anteriores são mantidas localmente e incluídas no JSON exportado.
- O SQL cria um histórico privado das 30 versões anteriores de cada usuário.

### Autorização e autenticação

- Não foi encontrada chave `service_role` ou `secret` no frontend.
- A tabela principal e o histórico usam RLS e políticas por `auth.uid()`.
- O bucket de avatares continua privado e limitado à pasta do usuário.
- A função de exclusão não aceita `user_id`; usa apenas a identidade do token.
- Novas senhas exigem pelo menos 8 caracteres no cliente. A mesma regra precisa ser
  habilitada no painel do Supabase.
- A troca de senha envia a senha atual para validação pelo Supabase.

### Injeção e dependências

- E-mail, tarefas, subtarefas e conteúdo extraído de PDF são renderizados como texto
  ou passam por escape antes de gerar HTML.
- Upload de avatar aceita somente MIME JPG, PNG ou WebP e usa extensão definida pelo
  tipo validado, não pelo nome fornecido pelo usuário.
- `supabase-js` foi fixado na versão `2.116.0`, evitando mudança automática do código
  remoto por causa de uma referência flutuante `@2`.

## Limitações e próximos reforços

1. **Aplicar o SQL remoto:** sem isso, as correções do navegador funcionam, mas as 30
   versões no banco ainda não existem.
2. **Backups externos:** `localStorage` não é backup permanente e pode ser apagado.
   Baixe o JSON regularmente e use os backups/PITR disponíveis no plano do Supabase.
3. **CDNs:** PDF.js, Tesseract e Supabase continuam vindo de CDNs. As versões estão
   fixas, mas o próximo endurecimento seria hospedar cópias verificadas localmente ou
   adicionar SRI.
4. **CSP:** ainda não há uma Content Security Policy estrita. Antes de adicioná-la,
   PDF, OCR, web workers, avatar e relatório visual precisam de um teste completo em
   navegador para evitar bloqueios funcionais.
5. **Criptografia ponta a ponta:** tarefas ficam protegidas por autenticação, TLS e
   RLS, mas não são cifradas no navegador com uma chave exclusiva do usuário.
6. **MFA do usuário final:** não existe fluxo de segundo fator na interface. É um
   reforço opcional para uma evolução futura.
7. **Modelo de dados:** todo o organizador ainda é um documento JSON. Isso é simples
   e apropriado para o tamanho atual, mas não é ideal para colaboração simultânea ou
   grandes volumes. Nesse cenário, tarefas e blocos deveriam virar registros próprios.

## Verificações executadas

- Sintaxe dos cinco arquivos JavaScript.
- Referências locais das três páginas HTML.
- Busca por chaves secretas conhecidas no código público.
- Presença das proteções essenciais de RLS, histórico e exclusão no SQL.
- `git diff --check`.
- Respostas HTTP 200 para páginas, estilos, scripts e imagens pelo Live Server.

O smoke test visual automatizado não foi concluído porque o Chrome headless deste
ambiente encerrou o processo gráfico antes da renderização. Por isso, a validação
visual e os fluxos autenticados permanecem no roteiro manual de aprovação.

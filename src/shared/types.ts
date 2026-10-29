/**
 * Tipos de domínio compartilhados entre o processo main e o renderer.
 * Nomes de identificadores em inglês; textos de UI/geração em português.
 */

/** Formatos de arquivo suportados para importação no MVP. */
export type FormatoArquivo = "txt" | "md" | "pdf";

/** Modos de geração de resumo. */
export type ModoResumo = "curto" | "longo";

/** Modos de geração de listas de exercícios e flashcards. */
export type ModoConteudo = "teorica" | "pratica" | "mista";

/**
 * Documento importado pelo usuário com o texto já extraído.
 * Serve de base para gerar resumo, flashcards e exercícios.
 */
export interface Documento {
  /** Identificador único do documento. */
  id: string;
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. */
  texto: string;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Caminho de origem no disco, quando conhecido (best-effort). */
  caminhoOrigem?: string;
  /** Data do arquivo (melhor fonte disponível: metadado interno do PDF ou mtime do disco) em ISO 8601, quando conhecida. */
  dataArquivo?: string;
}

/** Resumo gerado a partir de um documento. */
export interface Resumo {
  /** Documento de origem. */
  documentoId: string;
  /** Modo usado para gerar o resumo. */
  modo: ModoResumo;
  /** Texto do resumo. */
  conteudo: string;
  /** Data de geração em formato ISO 8601. */
  geradoEm: string;
}

/**
 * Um nó da árvore do mapa mental. A árvore é estritamente hierárquica
 * (cada nó tem no máximo um pai), espelhando a estrutura tema → ramos →
 * sub-ramos. `id` é único dentro de um mesmo mapa e serve de `key` estável
 * na UI e para controlar expandir/colapsar.
 */
export interface NoMapaMental {
  /** Id único do nó dentro do mapa (ex.: "n0", "n1", ...). */
  id: string;
  /** Rótulo curto exibido no nó (texto em português). */
  rotulo: string;
  /** Filhos diretos (ramos). Vazio em uma folha. */
  filhos: NoMapaMental[];
}

/**
 * Mapa mental gerado a partir de um documento. É a raiz da árvore mais os
 * metadados de geração, análogo a `Resumo`. O nó `raiz` é o tema central.
 */
export interface MapaMental {
  /** Documento de origem (preenchido ao salvar; "" até persistir). */
  documentoId: string;
  /** Nó central da árvore (o tema). */
  raiz: NoMapaMental;
  /** Data de geração em formato ISO 8601. */
  geradoEm: string;
}

/** Par pergunta/resposta extraído do conteúdo. */
export interface Flashcard {
  /** Pergunta (frente do card). */
  pergunta: string;
  /** Resposta (verso do card). */
  resposta: string;
}

/** Um exercício gerado a partir do conteúdo. */
export interface Exercicio {
  /** Enunciado do exercício. */
  enunciado: string;
  /** Resposta esperada ou gabarito. */
  resposta: string;
  /** Natureza do exercício. */
  modo: ModoConteudo;
}

/** Natureza de uma pergunta do quiz: múltipla escolha ou aberta. */
export type TipoPergunta = "multipla" | "aberta";

/** Uma alternativa de uma pergunta de múltipla escolha. */
export interface AlternativaQuiz {
  /** Texto da alternativa (em português). */
  texto: string;
  /** `true` se esta é a alternativa correta. */
  correta: boolean;
}

/**
 * Uma pergunta do quiz. União discriminada por `tipo` (no estilo de
 * `VinculoProva`): múltipla escolha carrega as `alternativas`; aberta carrega o
 * `gabarito` esperado. Trata os dois casos sem campos ambíguos/opcionais soltos.
 */
export type PerguntaQuiz =
  | {
      /** Pergunta de múltipla escolha. */
      tipo: "multipla";
      /** Enunciado da pergunta (em português). */
      enunciado: string;
      /** Alternativas; exatamente uma com `correta: true`. */
      alternativas: AlternativaQuiz[];
    }
  | {
      /** Pergunta aberta (resposta discursiva). */
      tipo: "aberta";
      /** Enunciado da pergunta (em português). */
      enunciado: string;
      /** Resposta/gabarito esperado, para a correção por IA. */
      gabarito: string;
    };

/** Modos de geração de quiz (próprio; não reusa `ModoConteudo`). */
export type ModoQuiz = "multipla" | "aberta" | "misto";

/**
 * Veredito de uma resposta corrigida pela IA: certa, parcialmente certa ou
 * errada. Os três níveis são o contrato fechado que o serviço aceita do
 * modelo; qualquer outro valor é rejeitado no parsing.
 */
export type Veredito = "correto" | "parcial" | "incorreto";

/**
 * Resultado da correção por IA de uma resposta. `veredito` carrega o valor
 * extra `"nao_avaliado"` como o estado seguro (resposta vazia ou a IA não
 * conseguiu avaliar) — modelado como um valor explícito, NÃO como `null`, para
 * a UI tratar sempre um veredito concreto. `comentario` é um feedback curto em
 * português (podado de forma defensiva no serviço).
 */
export interface AvaliacaoResposta {
  /** Veredito do modelo, ou `"nao_avaliado"` quando não há avaliação. */
  veredito: Veredito | "nao_avaliado";
  /** Comentário curto em português explicando o veredito. */
  comentario: string;
}

/**
 * Entrada para avaliar uma única resposta: o enunciado da questão, o gabarito
 * esperado e a resposta dada pelo aluno. Serve tanto para exercícios quanto
 * para as perguntas abertas do quiz — a mesma fronteira para os dois.
 */
export interface EntradaAvaliacao {
  /** Enunciado da questão (exercício ou pergunta aberta). */
  enunciado: string;
  /** Resposta esperada/gabarito usado como referência pela IA. */
  gabarito: string;
  /** Resposta dada pelo aluno, a ser avaliada. */
  resposta: string;
}

/**
 * Quiz gerado a partir de um documento: o modo pedido mais as perguntas e os
 * metadados de geração, análogo a `Resumo`/`MapaMental`.
 */
export interface Quiz {
  /** Documento de origem. */
  documentoId: string;
  /** Modo usado para gerar o quiz. */
  modo: ModoQuiz;
  /** Perguntas do quiz (múltiplas e/ou abertas, conforme o modo). */
  perguntas: PerguntaQuiz[];
  /** Data de geração em formato ISO 8601. */
  geradoEm: string;
}

/**
 * Resultado de importar e extrair o texto de um arquivo.
 * Produzido pelo serviço `files.ts` e devolvido ao renderer via IPC.
 */
export interface ArquivoImportado {
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. Vazio quando não há texto extraível. */
  texto: string;
  /**
   * `true` quando o arquivo (ex.: PDF escaneado) não tem texto extraível.
   * Nesse caso a UI exibe o aviso "sem texto extraível".
   */
  semTextoExtraivel: boolean;
  /** Caminho de origem no disco, quando conhecido (fluxo de import). */
  caminhoOrigem?: string;
  /** Data do arquivo (melhor fonte disponível: metadado interno do PDF ou mtime do disco) em ISO 8601, quando conhecida. */
  dataArquivo?: string;
  /** Id do caderno sugerido a partir da pasta-mãe (fluxo de import). */
  cadernoIdSugerido?: string;
  /** Nome do caderno sugerido a partir da pasta-mãe (fluxo de import). */
  cadernoNomeSugerido?: string;
}

/**
 * Documento persistido em disco com todos os seus artefatos gerados.
 *
 * É o registro completo salvo em JSON no `userData`: o texto importado mais o
 * resumo, os flashcards e os exercícios gerados a partir dele. Cada documento
 * guarda seus próprios artefatos; artefatos ainda não gerados ficam ausentes
 * (`undefined`). Serve de base para a tela de Histórico reabrir resultados.
 */
export interface DocumentoSalvo {
  /** Identificador único do documento (nome do arquivo JSON em disco). */
  id: string;
  /** Nome do arquivo original (ex.: "Capítulo 1.pdf"). */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Texto extraído do arquivo. */
  texto: string;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Data da última atualização (nova geração salva) em ISO 8601. */
  atualizadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Caminho de origem no disco, quando conhecido (best-effort). */
  caminhoOrigem?: string;
  /** Data do arquivo (melhor fonte disponível: metadado interno do PDF ou mtime do disco) em ISO 8601, quando conhecida. */
  dataArquivo?: string;
  /** Resumo gerado, se houver. */
  resumo?: Resumo;
  /** Flashcards gerados, se houver. */
  flashcards?: Flashcard[];
  /** Exercícios gerados, se houver. */
  exercicios?: Exercicio[];
  /** Mapa mental gerado, se houver. */
  mapaMental?: MapaMental;
  /** Quiz gerado, se houver. */
  quiz?: Quiz;
}

/**
 * Resumo de um documento salvo para listagem no Histórico, sem carregar o
 * texto e os artefatos inteiros. Mantém a lista leve mesmo com muitos itens.
 */
export interface ResumoDocumentoSalvo {
  /** Identificador único do documento. */
  id: string;
  /** Nome do arquivo original. */
  nome: string;
  /** Formato detectado a partir da extensão. */
  formato: FormatoArquivo;
  /** Data de importação em formato ISO 8601. */
  importadoEm: string;
  /** Data da última atualização em ISO 8601. */
  atualizadoEm: string;
  /** Id normalizado do caderno a que o documento pertence. */
  cadernoId: string;
  /** Nome de exibição do caderno (grafia escolhida pelo usuário). */
  cadernoNome: string;
  /** Data do arquivo (melhor fonte disponível: metadado interno do PDF ou mtime do disco) em ISO 8601, quando conhecida. */
  dataArquivo?: string;
  /** `true` se o documento tem um resumo salvo. */
  temResumo: boolean;
  /** `true` se o documento tem flashcards salvos. */
  temFlashcards: boolean;
  /** `true` se o documento tem exercícios salvos. */
  temExercicios: boolean;
  /** `true` se o documento tem um mapa mental salvo. */
  temMapaMental: boolean;
  /** `true` se o documento tem um quiz salvo. */
  temQuiz: boolean;
}

/** Um caderno agregado para a tela de Histórico (derivado dos documentos). */
export interface ResumoCaderno {
  /** Id normalizado do caderno. */
  cadernoId: string;
  /** Nome de exibição (grafia do documento mais recente do caderno). */
  cadernoNome: string;
  /** Quantos documentos pertencem a este caderno. */
  totalDocumentos: number;
  /** `atualizadoEm` (ISO) do documento mais recente, para ordenar os cadernos. */
  atualizadoEm: string;
}

/**
 * Resultado de uma importação de pasta em lote (contagens + cadernos tocados).
 *
 * Documentos importados sem texto extraível (ex.: PDFs escaneados) contam
 * apenas em `importados`; NÃO há contador separado de "sem texto" no resumo do
 * lote (fora de escopo). O aviso "sem texto extraível" aparece por documento ao
 * abri-lo no Histórico, como hoje.
 */
export interface ResultadoImportacaoPasta {
  /** Documentos efetivamente criados. */
  importados: number;
  /** Arquivos com extensão não suportada (contados, não lidos). */
  ignoradosPorFormato: number;
  /** Arquivos pulados por já terem sido importados (mesmo caminhoOrigem). */
  ignoradosPorDuplicata: number;
  /** Arquivos encontrados mas que falharam ao ler/extrair/salvar. */
  falhas: number;
  /** Nomes de exibição dos cadernos tocados (distintos, ordenados). */
  cadernosTocados: string[];
  /** `null` se nada estourou; senão qual limite parou/afetou o lote. */
  limiteExcedido: "arquivos" | "profundidade" | null;
}

/** Limites de quantidade para flashcards e exercícios (inclusivos). */
export const QUANTIDADE_MINIMA = 5;
export const QUANTIDADE_MAXIMA = 100;

/**
 * Estado de disponibilidade do Ollama, consultado pela UI para mostrar o
 * status e, quando offline, as instruções de instalação/inicialização.
 */
export interface OllamaStatus {
  /** `true` quando o Ollama está acessível localmente. */
  disponivel: boolean;
  /** Modelos baixados localmente (vazio se offline ou nenhum baixado). */
  modelos: string[];
  /** Modelo atualmente selecionado para as gerações. */
  modeloSelecionado: string;
}

/** Modo de distribuição de uma prova abrangente entre os cadernos. */
export type ModoDistribuicao = "rotacao" | "intercalado";

/**
 * Vínculo de uma prova: ligada a UM caderno, ou abrangente (cobre todos os
 * cadernos) com um modo de distribuição. É uma união discriminada por `tipo`
 * para que o código trate os dois casos sem campos ambíguos/opcionais soltos.
 */
export type VinculoProva =
  | {
      /** Prova ligada a um único caderno. */
      tipo: "caderno";
      /** Id normalizado do caderno-alvo (como em `Documento.cadernoId`). */
      cadernoId: string;
      /** Nome de exibição do caderno (grafia no momento da criação). */
      cadernoNome: string;
    }
  | {
      /** Prova abrangente (ex.: ENEM/ENADE): cobre todos os cadernos. */
      tipo: "abrangente";
      /** Como distribuir os cadernos pelos dias de revisão. */
      modoDistribuicao: ModoDistribuicao;
    };

/**
 * Uma sessão de revisão agendada para uma prova, em um dia específico.
 * `data` é a data-calendário local, formatada como "YYYY-MM-DD" — uma data
 * pura, SEM horário nem fuso, para a aritmética de dias ser estável e
 * testável. `manual` registra se a sessão foi sugerida pelo algoritmo ou
 * criada/alterada manualmente, para a regra de recomputar-vs-preservar.
 */
export interface SessaoRevisao {
  /** Id único da sessão dentro de uma prova (ex.: "s0", "s1", ...). */
  id: string;
  /** Dia da revisão como data-calendário local "YYYY-MM-DD". */
  data: string;
  /**
   * Quantos dias antes da prova esta sessão cai (ex.: 7, 3, 1). Campo SEMPRE
   * derivado das datas: `diferencaDias(prova.data, data)`. Para sugeridas,
   * coincide com o intervalo que a gerou; para manuais em data arbitrária, é
   * recalculado em `salvarSessoes` (nunca vem solto do renderer).
   */
  diasAntes: number;
  /** `true` se o usuário criou/editou/moveu esta sessão (edição manual). */
  manual: boolean;
  /**
   * `true` se o usuário marcou esta sessão como concluída. Opcional e
   * puramente aditivo; ausente/`false` = não concluída.
   */
  concluida?: boolean;
}

/**
 * Uma prova com data, vínculo (caderno único ou abrangente) e a agenda de
 * revisão por repetição espaçada. As `sessoes` guardam tanto o que o algoritmo
 * sugeriu quanto o que o usuário editou — nunca são recomputadas de modo a
 * apagar silenciosamente edições manuais. `intervalos` são os "dias antes"
 * usados ao gerar a agenda automática (default 7/3/1, configuráveis).
 */
export interface Prova {
  /** Identificador único da prova (nome do arquivo JSON em disco). */
  id: string;
  /** Título da prova (texto em português, ex.: "P1 de Cálculo"). */
  titulo: string;
  /** Data da prova como data-calendário local "YYYY-MM-DD". */
  data: string;
  /** Vínculo: caderno único ou abrangente com modo de distribuição. */
  vinculo: VinculoProva;
  /** Intervalos de repetição espaçada ("dias antes"), ex.: [7, 3, 1]. */
  intervalos: number[];
  /** Sessões de revisão (sugeridas + edições manuais), ordenadas por data. */
  sessoes: SessaoRevisao[];
  /** Data de criação em ISO 8601 (timestamp completo). */
  criadoEm: string;
  /** Data da última atualização em ISO 8601 (timestamp completo). */
  atualizadoEm: string;
  /** Plano de estudo guiado (questionário), quando o aluno o montou. */
  plano?: PlanoEstudo;
}

/** Qual prova é — define o recorte base vs novo (intent). */
export type OrdinalProva = "primeira" | "segunda" | "final";

/** Preferência de checkpoint (comportamento fica na fatia 4; aqui só persiste). */
export type PreferenciaCheckpoint = "automatico" | "lembrete";

/** Nível de dificuldade autodeclarada de um tópico pelo aluno. */
export type NivelDificuldade = "facil" | "media" | "dificil";

/**
 * Um tópico declarado no questionário. `id` é estável e 1:1 com o documento
 * de origem quando houver (para casar com a ordenação cronológica da fatia 1);
 * quando o tópico é digitado à mão, o id é derivado do título com o prefixo
 * `manual:` (`manual:<slug>-<índice>`), garantindo que os espaços de id "veio
 * de doc" (um `randomUUID`) e "digitado à mão" sejam disjuntos.
 */
export interface TopicoPlano {
  /** Id estável do tópico (casa com `ItemCronologico.id` quando vem de doc; `manual:<slug>-<i>` quando digitado à mão). */
  id: string;
  /** Rótulo em português exibido ao aluno (ex.: "Limites"). */
  titulo: string;
  /** `true` se é conteúdo que CAI na prova (o "novo"); `false` = base. */
  novo: boolean;
  /** Dificuldade autodeclarada. Ausente = tratada como "media". */
  dificuldade?: NivelDificuldade;
  /** Data do arquivo de origem (ISO canônica UTC), quando o tópico vem de doc. */
  dataArquivo?: string;
}

/**
 * Respostas do questionário do plano de estudo, persistidas junto da Prova.
 * Bloco OPCIONAL e ADITIVO: prova sem plano continua válida. A `Prova.data`
 * NÃO é duplicada aqui (já existe); a agenda dia-a-dia é DERIVADA destes
 * campos + da data, recalculada sob demanda (não persistida).
 */
export interface PlanoEstudo {
  /** Qual prova é (define base vs novo). */
  ordinal: OrdinalProva;
  /** Horas de estudo disponíveis por dia (inteiro 1–24, saneado). */
  horasPorDia: number;
  /** Dias de estudo disponíveis por semana (inteiro 1–7, saneado). */
  diasPorSemana: number;
  /** Tópicos declarados (base e novo), já na ordem em que foram informados. */
  topicos: TopicoPlano[];
  /**
   * Ordem cronológica manual OPCIONAL: ids de tópicos na ordem desejada
   * (menor índice = mais à base). Serializável; reconstruída como
   * ReadonlyMap no main para alimentar `ordenarCronologicamente`. Ausente/
   * vazio = ordenação 100% automática por data.
   */
  ordemManual?: string[];
  /** Preferência de checkpoint (só persistida nesta fatia; fatia 4 age). */
  checkpoint: PreferenciaCheckpoint;
  /** Carimbo ISO 8601 da última vez que o QUESTIONÁRIO foi salvo. */
  atualizadoEm: string;
}

/**
 * Resumo de uma prova para a lista da tela de Agenda (contagem regressiva),
 * sem carregar as sessões inteiras. `diasRestantes` e `estado` são calculados
 * em relação ao "hoje" local; por isso vêm do handler, que injeta a data atual
 * na lógica pura — a listagem crua do disco não os traz.
 */
export interface ResumoProva {
  /** Id da prova. */
  id: string;
  /** Título da prova. */
  titulo: string;
  /** Data da prova "YYYY-MM-DD". */
  data: string;
  /** Dias restantes até a prova (0 = hoje; negativo = já passou). */
  diasRestantes: number;
  /** Classificação temporal para destaque/filtro na UI. */
  estado: "hoje" | "amanha" | "futura" | "passada";
  /** Tipo do vínculo, para a UI mostrar o rótulo certo sem carregar tudo. */
  tipoVinculo: "caderno" | "abrangente";
  /** Nome do caderno-alvo (só quando `tipoVinculo === "caderno"`). */
  cadernoNome?: string;
}

/**
 * Um caderno em foco na dica do dia, com o estado do seu material. A UI monta
 * a frase a partir destes campos ("N documentos; tem resumo e flashcards").
 * Derivado de `ResumoCaderno` + flags de artefatos agregadas.
 */
export interface CadernoEmFoco {
  /** Id normalizado do caderno. */
  cadernoId: string;
  /** Nome de exibição do caderno. */
  cadernoNome: string;
  /** Quantos documentos o caderno tem (de `ResumoCaderno.totalDocumentos`). */
  totalDocumentos: number;
  /** `true` se ALGUM documento do caderno tem resumo salvo. */
  temResumo: boolean;
  /** `true` se ALGUM documento do caderno tem flashcards salvos. */
  temFlashcards: boolean;
}

/**
 * Dica mecânica do dia para uma prova: o que revisar hoje, derivada das datas,
 * do vínculo e do modo de distribuição — SEM IA. `cadernosEmFoco` descreve o(s)
 * alvo(s) de hoje COM o estado do material (contagem de documentos e artefatos);
 * `mensagem` é a frase pronta em português para a UI.
 */
export interface DicaDoDia {
  /** Id da prova a que a dica se refere. */
  provaId: string;
  /** Dias restantes até a prova (espelha `ResumoProva.diasRestantes`). */
  diasRestantes: number;
  /** `true` se existe uma sessão de revisão agendada para hoje. */
  temRevisaoHoje: boolean;
  /**
   * Cadernos em foco hoje, com estado do material. Vazio quando não há revisão
   * hoje ou quando a prova abrangente não tem cadernos ainda.
   */
  cadernosEmFoco: CadernoEmFoco[];
  /** Frase pronta em português para exibir. */
  mensagem: string;
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { PageAudit } from '../../../libs/database/src/entities/page-audit.entity';
import { AccessibilityIssue } from '../../../libs/database/src/entities/accessibility-issue.entity';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

type Provider = 'claude' | 'openai' | 'ollama' | 'offline';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly anthropic: Anthropic | null;
  private readonly openai: OpenAI | null;
  private readonly ollama: OpenAI | null;       // LLM local (Ollama, API compatible OpenAI)
  private readonly ollamaModel: string;
  private readonly provider: Provider;

  constructor(
    @InjectRepository(PageAudit) private readonly pageAudits: Repository<PageAudit>,
    @InjectRepository(AccessibilityIssue) private readonly issues: Repository<AccessibilityIssue>,
  ) {
    // Priorité : Claude > OpenAI > Ollama (local) > hors-ligne. Tout vient du .env, jamais du code.
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

    // Ollama : LLM open-source qui tourne en local (gratuit, sans clé, sans internet).
    // Activer avec OLLAMA_MODEL=llama3.2 dans le .env. (serveur par défaut: http://localhost:11434)
    this.ollamaModel = process.env.OLLAMA_MODEL ?? '';
    this.ollama = this.ollamaModel
      ? new OpenAI({ baseURL: process.env.OLLAMA_URL ?? 'http://localhost:11434/v1', apiKey: 'ollama' })
      : null;

    this.provider = this.anthropic ? 'claude' : this.openai ? 'openai' : this.ollama ? 'ollama' : 'offline';
    this.logger.log(`ChatService: provider = ${this.provider}${this.provider === 'ollama' ? ` (${this.ollamaModel})` : ''}`);
  }

  /** Client + modèle OpenAI-compatible actif (OpenAI ou Ollama). */
  private activeOpenAILike(): { client: OpenAI; model: string } | null {
    if (this.provider === 'openai' && this.openai) return { client: this.openai, model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini' };
    if (this.provider === 'ollama' && this.ollama) return { client: this.ollama, model: this.ollamaModel };
    return null;
  }

  get mode(): 'ai' | 'offline' {
    return this.provider === 'offline' ? 'offline' : 'ai';
  }

  get currentProvider(): Provider {
    return this.provider;
  }

  /** Teste réellement la clé en faisant un mini-appel. */
  async testKey(): Promise<{ ok: boolean; provider: Provider; error?: string }> {
    try {
      if (this.provider === 'claude') {
        await this.anthropic!.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        });
        return { ok: true, provider: 'claude' };
      }
      const oai = this.activeOpenAILike();
      if (oai) {
        await oai.client.chat.completions.create({
          model: oai.model,
          max_tokens: 5,
          messages: [{ role: 'user', content: 'ping' }],
        });
        return { ok: true, provider: this.provider };
      }
      return { ok: false, provider: 'offline', error: 'Aucun LLM configuré (mode hors-ligne)' };
    } catch (e: any) {
      const reason = e?.status ? `${e.status} ${e?.error?.message ?? e?.message}` : e?.message;
      return { ok: false, provider: this.provider, error: reason };
    }
  }

  /** Génération de texte one-shot pour le rapport (IA). Renvoie null si hors-ligne ou échec. */
  async generateText(prompt: string): Promise<string | null> {
    try {
      if (this.provider === 'claude') {
        const r = await this.anthropic!.messages.create({
          model: 'claude-opus-4-8',
          max_tokens: 1200,
          system: this.systemPrompt(''),
          messages: [{ role: 'user', content: prompt }] as any,
        });
        return r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
      }
      const oai = this.activeOpenAILike();
      if (oai) {
        const c = await oai.client.chat.completions.create({
          model: oai.model,
          max_tokens: 1200,
          messages: [
            { role: 'system', content: this.systemPrompt('') },
            { role: 'user', content: prompt },
          ] as any,
        });
        return c.choices[0]?.message?.content ?? null;
      }
      return null;
    } catch (e: any) {
      this.logger.error(`generateText error: ${e?.message}`);
      return null;
    }
  }

  /** Construit le contexte d'accessibilité d'une page (ses fautes) pour le chatbot. */
  private async buildPageContext(pageAuditId?: string): Promise<string> {
    if (!pageAuditId) return '';
    const page = await this.pageAudits.findOne({
      where: { id: pageAuditId },
      relations: { issues: true },
    });
    if (!page) return '';

    const lines: string[] = [];
    lines.push(`Page auditée : ${page.url}`);
    if (page.pageScore != null) lines.push(`Score d'accessibilité : ${Math.round(page.pageScore)}/100`);
    lines.push(`Nombre de violations : ${page.issues?.length ?? 0}`);
    lines.push('');
    lines.push('Violations détectées :');
    for (const i of (page.issues ?? []).slice(0, 25)) {
      lines.push(`- [${i.impact}] ${i.ruleId} : ${i.help}. ${i.description} (aide: ${i.helpUrl ?? 'n/a'})`);
    }
    return lines.join('\n');
  }

  private systemPrompt(context: string): string {
    return [
      "Tu es un assistant expert en accessibilité web (WCAG 2.0/2.1, RGAA).",
      "Tu aides les développeurs à comprendre et corriger les problèmes d'accessibilité.",
      "Réponds en français, de façon claire et concise. Donne des exemples de code HTML/ARIA quand c'est utile.",
      context ? `\nContexte de la page actuellement auditée :\n${context}` : '',
    ].join('\n');
  }

  async chat(message: string, history: ChatMessage[], pageAuditId?: string) {
    const context = await this.buildPageContext(pageAuditId);

    if (this.provider === 'claude') return this.chatWithClaude(message, history, context);
    const oai = this.activeOpenAILike(); // OpenAI ou Ollama (local)
    if (oai) return this.chatWithOpenAILike(oai.client, oai.model, message, history, context);
    return { mode: 'offline' as const, answer: this.offlineAnswer(message, context) };
  }

  // ── Mode IA : OpenAI OU Ollama (même API compatible) ──────────────────────
  private async chatWithOpenAILike(client: OpenAI, model: string, message: string, history: ChatMessage[], context: string) {
    const messages = [
      { role: 'system' as const, content: this.systemPrompt(context) },
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];
    try {
      const completion = await client.chat.completions.create({
        model,
        max_tokens: 1500,
        messages: messages as any,
      });
      const text = completion.choices[0]?.message?.content ?? '';
      return { mode: 'ai' as const, answer: text };
    } catch (e: any) {
      const reason = e?.status ? `${e.status} ${e?.error?.message ?? e?.message}` : e?.message;
      this.logger.error(`LLM (${this.provider}) error: ${reason}`);
      const hint = this.provider === 'ollama'
        ? `⚠️ L'appel au LLM local (Ollama, ${model}) a échoué (${reason}). Vérifie qu'Ollama tourne et que le modèle est installé (ollama pull ${model}).`
        : `⚠️ L'appel à OpenAI a échoué (${reason}). Vérifie OPENAI_API_KEY et le crédit du compte.`;
      return { mode: 'offline' as const, answer: `${hint}\n\n` + this.offlineAnswer(message, context) };
    }
  }

  // ── Mode IA : Claude ──────────────────────────────────────────────────────
  private async chatWithClaude(message: string, history: ChatMessage[], context: string) {
    const messages = [
      ...history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: message },
    ];

    try {
      const response = await this.anthropic!.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 1500,
        thinking: { type: 'adaptive' },
        system: this.systemPrompt(context),
        messages: messages as any,
      });
      const text = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n');
      return { mode: 'ai' as const, answer: text };
    } catch (e: any) {
      this.logger.error(`Claude error: ${e?.message}`);
      // Repli sur le mode hors-ligne si l'appel échoue
      return { mode: 'offline' as const, answer: this.offlineAnswer(message, context) };
    }
  }

  // ── Mode hors-ligne : réponses basées sur les données + FAQ WCAG ──────────
  private offlineAnswer(message: string, context: string): string {
    const q = message.toLowerCase();

    // FAQ accessibilité de base
    const faqs: { keys: string[]; answer: string }[] = [
      {
        keys: ['contrast', 'contraste', 'couleur'],
        answer:
          "Un problème de **contraste** signifie que le texte n'est pas assez lisible par rapport à son arrière-plan. WCAG exige un ratio d'au moins **4.5:1** pour le texte normal et **3:1** pour le grand texte (≥18pt). Solution : assombrir le texte ou éclaircir le fond. Outil : vérificateur de contraste WebAIM.",
      },
      {
        keys: ['alt', 'image', 'alternatif'],
        answer:
          "Une **image sans texte alternatif** n'est pas accessible aux lecteurs d'écran. Ajoute un attribut `alt` décrivant l'image : `<img src=\"logo.png\" alt=\"Logo de l'entreprise\">`. Pour une image décorative, utilise `alt=\"\"`.",
      },
      {
        keys: ['label', 'formulaire', 'input', 'champ'],
        answer:
          "Un **champ de formulaire sans label** empêche les utilisateurs de savoir quoi saisir. Associe un `<label>` : `<label for=\"email\">Email</label><input id=\"email\">`, ou utilise `aria-label=\"Email\"`.",
      },
      {
        keys: ['lien', 'link', 'bouton', 'button'],
        answer:
          "Un **lien ou bouton sans nom accessible** est annoncé « lien » sans contexte. Ajoute un texte visible, ou `aria-label` : `<button aria-label=\"Fermer\">×</button>`.",
      },
      {
        keys: ['wcag', "c'est quoi", 'définition', 'standard'],
        answer:
          "**WCAG** (Web Content Accessibility Guidelines) est le standard international d'accessibilité du W3C, avec 3 niveaux : **A**, **AA** (le plus courant légalement), **AAA**. Il s'articule autour de 4 principes : Perceptible, Utilisable, Compréhensible, Robuste.",
      },
      {
        keys: ['heading', 'titre', 'h1', 'h2'],
        answer:
          "Les **titres (h1–h6)** structurent la page pour les lecteurs d'écran. Règles : un seul `<h1>` par page, pas de saut de niveau (h2 → h4). Ils servent de plan de navigation.",
      },
      {
        keys: ['aria'],
        answer:
          "**ARIA** (Accessible Rich Internet Applications) ajoute de la sémantique quand le HTML natif ne suffit pas : `role`, `aria-label`, `aria-hidden`… Règle d'or : préfère toujours un élément HTML natif (`<button>`) à un `<div role=\"button\">`.",
      },
    ];

    for (const f of faqs) {
      if (f.keys.some((k) => q.includes(k))) {
        return f.answer + (context ? `\n\n---\n${this.summarizeContext(context)}` : '');
      }
    }

    // Question générique sur "les fautes / erreurs de cette page"
    if (q.includes('faute') || q.includes('erreur') || q.includes('problème') || q.includes('corrige') || q.includes('cette page')) {
      if (context) return this.summarizeContext(context);
      return "Sélectionne d'abord une page auditée, puis je pourrai te détailler ses problèmes d'accessibilité.";
    }

    return (
      "Je suis en **mode hors-ligne** (pas de clé API Claude configurée). Je peux quand même t'aider sur : le contraste, les textes alternatifs (alt), les labels de formulaire, les liens/boutons, les titres, ARIA, et te résumer les fautes de la page sélectionnée. " +
      "Pour des réponses IA complètes, ajoute OPENAI_API_KEY (ou ANTHROPIC_API_KEY) dans le .env du backend, puis REDÉMARRE report-service." +
      (context ? `\n\n---\n${this.summarizeContext(context)}` : '')
    );
  }

  private summarizeContext(context: string): string {
    return `📋 Résumé de la page :\n${context}`;
  }
}

import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare, X, Send, Sparkles, Phone, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { askPublicTcleanBot } from "@/lib/business.functions";
import botAvatar from "@/assets/tclean-bot.png";

type Message = { role: "bot" | "user"; text: string };

const QUICK_QUESTIONS = [
  "Combien de temps pour le séchage ?",
  "Pouvez-vous enlever l'urine de chat/chien ?",
  "Quels sont vos tarifs ?",
  "Quelles communes desservez-vous ?",
  "Faut-il préparer le canapé avant ?",
];

const BOT_KNOWLEDGE = {
  sechage:
    "Grâce à notre aspiration professionnelle haute dépression par injection-extraction, comptez généralement entre 3 et 6 heures de séchage (parfois 12 h selon l'épaisseur du tissu) en aérant bien la pièce. Le meuble ne reste jamais trempé !",
  urine:
    "Oui tout à fait ! Nous appliquons un neutralisant enzymatique spécifique qui dissout les cristaux d'acide urique et élimine les bactéries à l'origine de l'odeur tenace, puis extrayons la saleté en profondeur de la fibre.",
  tarif:
    "Nos tarifs dépendent du modèle (canapé droit, canapé d'angle, convertible, panoramique en U, matelas, fauteuil ou chaises). Vous pouvez calculer votre prix exact et immédiat en 2 minutes sur notre configurateur en ligne !",
  zone: "Nous intervenons dans tout Strasbourg et l'ensemble de l'Eurométropole (Schiltigheim, Illkirch, Lingolsheim, Bischheim, Ostwald, etc.). Le déplacement est 100 % gratuit dans un rayon de 20 km autour de notre base !",
  preparer:
    "C'est très simple : retirez les plaids, coussins décoratifs et objets personnels, et dégagez environ 1 mètre autour du meuble pour laisser passer le matériel. Nous nous chargeons de tout le reste !",
};

/**
 * Interception des mots-clés spéciaux numérotés de 1 à 13.
 * Si un mot-clé correspond, renvoie le texte exact et BLOQUE l'appel ChatGPT.
 * Si aucun mot-clé ne correspond, renvoie null pour laisser ChatGPT répondre.
 */
function getSpecialKeywordAnswer(q: string): string | null {
  const lower = q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (/^(bonjour|salut|coucou|hello|bonsoir|yo|hey)/.test(lower)) {
    return "Bonjour et bienvenue chez TClean ! 👋 Comment puis-je vous aider aujourd'hui ? Avez-vous une question sur un canapé, un matelas ou un nettoyage à domicile ?";
  }

  // 3. PRÉSENTATION ET IDENTITÉ DU BOT
  if (/qui es[- ]tu|t'es qui|tu es qui|presente[- ]toi|ton nom|comment tu t'appelles/.test(lower)) {
    return "Je suis TClean Bot, la mascotte et assistant virtuel de TClean ! 🧽 Je suis là pour répondre à toutes vos questions sur l'entretien de vos canapés, le temps de séchage, les taches, nos zones et nos tarifs à Strasbourg.";
  }

  // 4. TEMPS DE SÉCHAGE
  if (/sech|sec|combien de temps|delai|temps.*sech/.test(lower)) {
    return BOT_KNOWLEDGE.sechage;
  }

  // 5. URINE, ODEURS ET ANIMAUX
  if (/urine|pipi|chat|chien|odeur|animaux|poil/.test(lower)) {
    return BOT_KNOWLEDGE.urine;
  }

  // 6. PRIX ET TARIFS
  if (/prix|tarif|combien|cout|devis|estimation/.test(lower)) {
    return BOT_KNOWLEDGE.tarif;
  }

  // 7. ZONES D'INTERVENTION ET COMMUNE
  if (/zone|commune|ou|strasbourg|deplacement|secteur|ville|alsace|rayon/.test(lower)) {
    return BOT_KNOWLEDGE.zone;
  }

  // 8. PRÉPARATION AVANT INTERVENTION
  if (/prepar|avant|deplacer|faire quoi|acces/.test(lower)) {
    return BOT_KNOWLEDGE.preparer;
  }

  // 9. TACHES DIFFICILES (CAFÉ, VIN, GRAS, ETC.)
  if (/cafe|vin|chocolat|gras|sauce|sang|feutre|stylo|nourriture/.test(lower)) {
    return "Nous traitons ces taches au quotidien ! L'injection-extraction à chaud décolle les pigments incrustés sans abîmer les fibres. Conseil important : évitez de frotter avec une éponge avant notre passage pour ne pas fixer la tache.";
  }

  // 10. CUIR ET MATIÈRES DÉLICATES
  if (/cuir|daim|nubuck|velours|lin/.test(lower)) {
    return "Nous intervenons sur les tissus (coton, polyester, microfibre, velours...). Pour le cuir ou les matières très délicates, nous réalisons un diagnostic préalable pour adapter la pression et les produits nettoyants.";
  }

  // 11. NETTOYAGE DE MATELAS ET ACARIENS
  if (/matelas|acarien|punaise|allergie/.test(lower)) {
    return "Oui, nous nettoyons et désinfectons les matelas 1 ou 2 places ! Notre traitement élimine les acariens, la transpiration et les peaux mortes en profondeur pour un couchage parfaitement assaini.";
  }

  // 12. REMERCIEMENTS ET COMPLIMENTS
  if (/merci|super|top|parfait|genial|cool|nickel|impeccable/.test(lower)) {
    return "Avec grand plaisir ! N'hésitez pas si vous avez la moindre autre question. Vous pouvez aussi tester notre configurateur en 2 clics pour obtenir votre tarif immédiat ! ✨";
  }

  // 13. AU REVOIR ET DÉPART
  if (/au revoir|bonne journee|bonne soiree|a bientot|a plus|bye|ciao/.test(lower)) {
    return "Au revoir et excellente journée à vous ! Au plaisir de redonner de l'éclat à votre mobilier chez TClean ! 👋✨";
  }

  // AUCUN MOT-CLÉ SPÉCIAL : renvoie null pour que le vrai ChatGPT prenne le relais
  return null;
}

export function BotWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "bot",
      text: "Bonjour ! Je suis l'assistant TClean 🧽. Posez-moi vos questions sur le nettoyage de vos canapés, le temps de séchage ou nos tarifs à Strasbourg !",
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, typing]);

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend ?? input).trim();
    if (!text || typing) return;

    const userMsg: Message = { role: "user", text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    if (!textToSend) setInput("");
    setTyping(true);

    // ÉTAPE 1 : Test des mots-clés spéciaux pré-remplis
    const specialReply = getSpecialKeywordAnswer(text);
    if (specialReply) {
      setTimeout(() => {
        setMessages((prev) => [...prev, { role: "bot", text: specialReply }]);
        setTyping(false);
      }, 400);
      return; // CHATGPT EST ARRÊTÉ ICI !
    }

    // ÉTAPE 2 : Si aucun mot-clé spécial, on interroge le vrai modèle ChatGPT
    try {
      const res = await askPublicTcleanBot({
        data: {
          question: text,
          history: nextMessages.slice(-8),
        },
      });
      const reply =
        res?.answer?.trim() || "Je suis à votre écoute ! Comment puis-je vous aider pour votre canapé ou textile ?";
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Pour toute question précise ou tarif immédiat, vous pouvez utiliser notre configurateur en ligne ou nous appeler directement au 07 44 88 11 70 !",
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end">
      {/* Fenêtre de discussion */}
      {open && (
        <div className="mb-3 w-[calc(100vw-24px)] max-w-[380px] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col h-[460px] max-h-[70dvh] sm:max-h-[520px] sm:h-[520px] animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="relative">
                <img
                  src={botAvatar}
                  alt="TClean Bot"
                  className="w-10 h-10 rounded-full object-cover bg-white/10 p-0.5 border border-white/20"
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 border-2 border-primary rounded-full" />
              </div>
              <div>
                <h3 className="font-semibold text-sm leading-tight">TClean Assistant</h3>
                <p className="text-xs text-primary-foreground/80 flex items-center gap-1">
                  <Sparkles size={11} /> IA en direct • Strasbourg
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors text-primary-foreground"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.map((m, idx) => (
              <div key={idx} className={`flex gap-2.5 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "bot" && (
                  <img src={botAvatar} alt="Bot" className="w-7 h-7 rounded-full object-cover shrink-0 mt-0.5" />
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card text-card-foreground border border-border/60 shadow-sm rounded-bl-sm"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {typing && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground italic">
                <img src={botAvatar} alt="Bot" className="w-6 h-6 rounded-full object-cover" />
                <span className="inline-flex items-center gap-1">
                  TClean Bot réfléchit
                  <span className="inline-flex gap-0.5">
                    <span
                      className="w-1 h-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "0ms" }}
                    />
                    <span
                      className="w-1 h-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="w-1 h-1 rounded-full bg-current animate-bounce"
                      style={{ animationDelay: "300ms" }}
                    />
                  </span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Questions rapides */}
          <div className="px-3 py-2 bg-muted/40 border-t border-border/40 overflow-x-auto flex gap-1.5 no-scrollbar">
            {QUICK_QUESTIONS.map((q, i) => (
              <button
                key={i}
                disabled={typing}
                onClick={() => handleSend(q)}
                className="whitespace-nowrap text-[11px] px-2.5 py-1 rounded-full bg-background hover:bg-primary/10 hover:text-primary text-foreground/80 border border-border/60 transition-colors shrink-0 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Liens d'action */}
          <div className="px-3 py-1.5 bg-background flex items-center justify-between text-[11px] border-t border-border/40 text-muted-foreground">
            <Link
              to="/configurateur"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 hover:text-primary font-medium"
            >
              Calculer mon tarif <ArrowUpRight size={12} />
            </Link>
            <a href="tel:0744881170" className="inline-flex items-center gap-1 hover:text-primary">
              <Phone size={11} /> 07 44 88 11 70
            </a>
          </div>

          {/* Saisie de message */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="p-2.5 bg-background border-t border-border flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={typing ? "L'IA prépare sa réponse..." : "Posez votre question..."}
              disabled={typing}
              className="flex-1 bg-muted/50 rounded-full px-3.5 py-2 text-base sm:text-sm focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || typing}
              className="rounded-full w-9 h-9 shrink-0"
              aria-label="Envoyer"
            >
              <Send size={15} />
            </Button>
          </form>
        </div>
      )}

      {/* Bouton flottant de la mascotte */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="group relative flex items-center justify-center rounded-full shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 opacity-80 hover:opacity-100"
        aria-label="Discuter avec l'assistant TClean"
      >
        <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary bg-primary/10 shadow-lg">
          <img
            src={botAvatar}
            alt="TClean Assistant"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
          />
        </div>
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-background" />
        </span>
        {!open && (
          <div className="hidden sm:flex absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-popover text-popover-foreground text-xs font-medium px-3 py-1.5 rounded-full shadow-md border border-border whitespace-nowrap items-center gap-1.5 opacity-90 group-hover:opacity-100 transition-opacity">
            <MessageSquare size={13} className="text-primary" />
            Une question ? Posez-la moi !
          </div>
        )}
      </button>
    </div>
  );
}

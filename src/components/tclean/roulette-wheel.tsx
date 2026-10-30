import { useEffect, useRef, useState } from "react";
import { Sparkles, Trophy, XCircle, Check } from "lucide-react";
import { SOCIAL_LINKS, SocialIcon, type SocialId } from "./social-links";

interface RouletteWheelProps {
  maxPercent?: number;
  played?: boolean;
  won?: boolean;
  lostBet?: number;
  onFinish: (result: { won: boolean; bet: number; newPercent: number }) => void;
}

export function RouletteWheel({
  played: initialPlayed = false,
  won: initialWon = false,
  onFinish,
}: RouletteWheelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visited, setVisited] = useState<SocialId[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [played, setPlayed] = useState(initialPlayed);
  const [result, setResult] = useState<"won" | "lost" | null>(initialPlayed ? (initialWon ? "won" : "lost") : null);

  useEffect(() => {
    if (initialPlayed) {
      setPlayed(true);
      setResult(initialWon ? "won" : "lost");
    }
  }, [initialPlayed, initialWon]);

  const winningCount = visited.length;
  const [winningIndices, setWinningIndices] = useState<number[]>([]);

  useEffect(() => {
    if (played || isSpinning) return;
    const indices: number[] = [];
    while (indices.length < winningCount) {
      const rand = Math.floor(Math.random() * 32);
      if (!indices.includes(rand)) indices.push(rand);
    }
    setWinningIndices(indices);
  }, [winningCount, played, isSpinning]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 8;
    const totalSlices = 32;
    const sliceAngle = (2 * Math.PI) / totalSlices;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < totalSlices; i++) {
      const startAngle = i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const isWinner = winningIndices.includes(i);

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();

      if (isWinner) {
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#fbbf24";
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.fillStyle = i % 2 === 0 ? "#1b4332" : "#2d6a4f";
        ctx.fill();
        ctx.strokeStyle = "#133124";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(center, center, 32, 0, 2 * Math.PI);
    ctx.fillStyle = "#081c15";
    ctx.fill();
    ctx.strokeStyle = "#d4af37";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#f3eed9";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("TClean", center, center);
  }, [winningIndices]);

  const handleSpin = () => {
    if (isSpinning || played || winningIndices.length === 0) return;
    setIsSpinning(true);
    const targetSector = Math.floor(Math.random() * 32);
    const won = winningIndices.includes(targetSector);
    const targetAngleOnWheel = targetSector * 11.25 + 5.625;
    setRotation(360 * 7 + (270 - targetAngleOnWheel));

    window.setTimeout(() => {
      setIsSpinning(false);
      setPlayed(true);
      setResult(won ? "won" : "lost");
      onFinish({ won, bet: 0, newPercent: won ? 100 : 0 });
    }, 5000);
  };

  const visit = (id: SocialId) => {
    if (played || isSpinning) return;
    setVisited((v) => (v.includes(id) ? v : [...v, id]));
  };

  return (
    <div className="my-5 p-5 rounded-2xl border-2 border-amber-300 bg-gradient-to-b from-amber-50/90 to-amber-100/60 shadow-lg text-amber-950">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="text-amber-600 animate-pulse" size={22} />
        <h4 className="font-extrabold text-base">La Roulette de la Chance : Tentez le 100 % GRATUIT !</h4>
      </div>

      <p className="text-xs text-amber-900 leading-relaxed mb-4">
        La roue contient <strong>32 cases</strong>. Chaque réseau visité débloque <strong>1 case dorée</strong>. Si
        la flèche s’arrête sur une case dorée, votre nettoyage devient <strong>100 % OFFERT</strong> ! Sinon, vous
        gardez votre tarif normal, sans rien perdre.
      </p>

      {!played && (
        <div className="mb-4 grid gap-2">
          {SOCIAL_LINKS.map((s) => {
            const done = visited.includes(s.id);
            return (
              <a
                key={s.id}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => visit(s.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border-2 bg-white/90 px-3 py-2.5 text-sm font-bold shadow-sm transition ${
                  done ? "border-emerald-500" : "border-amber-200 hover:border-amber-400"
                }`}
              >
                <span className="flex items-center gap-3">
                  <SocialIcon id={s.id} size={28} />
                  Visiter notre {s.label}
                </span>
                {done ? (
                  <span className="flex items-center gap-1 text-emerald-700 text-xs">
                    <Check size={16} /> +1 case
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">+1 case dorée</span>
                )}
              </a>
            );
          })}
        </div>
      )}

      <div className="relative mx-auto my-4 w-[280px] h-[280px] flex items-center justify-center">
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none drop-shadow-[0_4px_6px_rgba(0,0,0,0.55)]">
          <svg width="28" height="38" viewBox="0 0 28 38" fill="none">
            <path
              d="M14 38L2 8C1 5.5 2.5 3 5 3H23C25.5 3 27 5.5 26 8L14 38Z"
              fill="url(#needleGrad)"
              stroke="#78350f"
              strokeWidth="1.5"
            />
            <path d="M14 38L14 3" stroke="#fef3c7" strokeWidth="1" opacity="0.65" />
            <circle cx="14" cy="7" r="3.5" fill="#fef3c7" stroke="#92400e" strokeWidth="1.2" />
            <defs>
              <linearGradient id="needleGrad" x1="14" y1="3" x2="14" y2="38" gradientUnits="userSpaceOnUse">
                <stop stopColor="#fbbf24" />
                <stop offset="0.6" stopColor="#f59e0b" />
                <stop offset="1" stopColor="#b45309" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        <div
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning ? "transform 5s cubic-bezier(0.12, 0.8, 0.2, 1)" : "none",
          }}
          className="rounded-full shadow-2xl overflow-hidden border-4 border-amber-400 bg-[#081c15]"
        >
          <canvas ref={canvasRef} width={270} height={270} className="block" />
        </div>
      </div>

      {!played ? (
        <button
          type="button"
          disabled={isSpinning || winningCount === 0}
          onClick={handleSpin}
          className="w-full py-3 px-4 rounded-xl font-black text-sm uppercase tracking-wider text-white bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:brightness-110 shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSpinning
            ? "🎡 La roue tourne à toute vitesse..."
            : winningCount === 0
              ? "Visitez au moins un réseau pour jouer"
              : `Lancer la Roue → ${winningCount} chance(s) sur 32`}
        </button>
      ) : (
        <div
          className={`p-4 rounded-xl text-center font-bold text-sm border-2 ${
            result === "won"
              ? "bg-emerald-100 border-emerald-500 text-emerald-950 animate-bounce"
              : "bg-rose-100 border-rose-400 text-rose-950"
          }`}
        >
          {result === "won" ? (
            <div className="flex flex-col items-center gap-1">
              <Trophy size={32} className="text-amber-600" />
              <span>🎉 VICTOIRE HISTORIQUE !</span>
              <span className="text-xs font-semibold text-emerald-800">
                La flèche s’est arrêtée sur une case dorée ! Votre nettoyage passe à 100 % GRATUIT (0,00 € TTC) !
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              <XCircle size={28} className="text-rose-600" />
              <span>❌ Pas de chance !</span>
              <span className="text-xs font-medium text-rose-900">
                La flèche est tombée sur une case verte. Vous gardez votre tarif et vos réductions habituelles.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

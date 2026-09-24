import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, Check, X, Zap, Box, Image as ImageIcon, Calendar, Clock, Lock, Heart, ArrowRight, Skull, HelpCircle, Unlock, Share2, Trophy, Sparkles, Eye, Brain, Hash, Code, Sword, Trash2 } from 'lucide-react';

// --- DONNÉES INTÉGRÉES DIRECTEMENT (Plus de dépendance externe) ---
import activitiesData from '../Scrapper/uipath_activities_enriched.json';


// Typage
interface Activity {
  id: string | number;
  name: string;
  package: string;
  category: string;
  type: string;
  input: string;
  output: string;
  year?: number | null; 
  icon?: string;
  rebus?: string;
  rebus_variations?: string[];
  keywords?: string[];
  description?: string;
}

const ACTIVITIES_DB: Activity[] = activitiesData as Activity[];

const STAGE_COUNT = 6;
const MAX_LIVES = 10;
const HISTORY_DAYS_LOOKBACK = 90;
const ATTEMPTS_FOR_HINT = 2;

// --- UTILITAIRES LOGIQUE ---

const getTodayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const simpleHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getDailyTargets = (dateStr: string) => {
  const blacklistIndices = new Set();
  const oneDay = 24 * 60 * 60 * 1000;
  const currentDate = new Date(dateStr);
  
  for (let i = 1; i <= HISTORY_DAYS_LOOKBACK; i++) {
    const pastDate = new Date(currentDate.getTime() - (i * oneDay));
    const pastKey = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;
    let seed = simpleHash(pastKey);
    for (let s = 0; s < STAGE_COUNT; s++) {
      const index = (seed + s * 13) % ACTIVITIES_DB.length;
      blacklistIndices.add(index);
    }
  }

  const targets: Activity[] = [];
  let seed = simpleHash(dateStr);
  let attempts = 0;
  
  while (targets.length < STAGE_COUNT && attempts < 1000) {
    const candidateIndex = seed % ACTIVITIES_DB.length;
    const isInBlacklist = blacklistIndices.has(candidateIndex);
    const isAlreadySelected = targets.some(t => t.id === ACTIVITIES_DB[candidateIndex].id);
    const ignoreBlacklist = ACTIVITIES_DB.length < (STAGE_COUNT * HISTORY_DAYS_LOOKBACK);

    if (!isAlreadySelected && (!isInBlacklist || ignoreBlacklist)) {
      targets.push(ACTIVITIES_DB[candidateIndex]);
    }
    seed = simpleHash(seed.toString() + "next"); 
    attempts++;
  }
  
  if (targets.length < STAGE_COUNT) {
     const remainingNeeded = STAGE_COUNT - targets.length;
     for(let i=0; i<remainingNeeded; i++) {
         if (ACTIVITIES_DB[i]) targets.push(ACTIVITIES_DB[i]);
     }
  }

  return targets;
};

// --- LOGIQUE VISUELLE ---

const getStatus = (guessVal: any, targetVal: any, type = "string") => {
  if (guessVal === targetVal) return "correct"; 
  if (type === "number") {
    if (guessVal === null || targetVal === null) return "incorrect";
    if (Math.abs(guessVal - targetVal) <= 2) return "close"; 
  }
  return "incorrect";
};

const getStyle = (status: string) => {
  switch (status) {
    case "correct": return "bg-green-600 border-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]";
    case "close": return "bg-yellow-600 border-yellow-500 text-white";
    default: return "bg-slate-700 border-slate-600 text-gray-300";
  }
};

const AttributeCell = React.memo(({ label, value, targetValue, delay, isNumber = false, isHint = false }: any) => {
  const status = isHint ? "correct" : getStatus(value, targetValue, isNumber ? "number" : "string");
  const style = getStyle(status);
  
  let arrow = null;
  if (isNumber && value !== targetValue && !isHint) {
     if (value !== null && targetValue !== null) {
        arrow = value < targetValue ? <ChevronUp size={16} className="inline ml-1" /> : <ChevronDown size={16} className="inline ml-1" />;
     }
  }

  const valStr = value === null ? "N/A" : String(value);
  const isLongText = valStr.length > 20;
  const isVeryLongText = valStr.length > 35;
  const fontSizeClass = isVeryLongText 
    ? "text-[8px] md:text-[9px] leading-tight" 
    : isLongText 
      ? "text-[9px] md:text-[10px] leading-snug" 
      : "text-[10px] md:text-xs leading-normal";

  return (
    <div 
      className={`
        flex flex-col items-center justify-center p-1 md:p-2 rounded-lg border 
        ${fontSizeClass} font-semibold transition-all duration-500 transform animate-flip
        min-h-[60px] md:min-h-[70px] ${style} ${isHint ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-slate-900' : ''}
      `}
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="opacity-70 text-[8px] md:text-[9px] uppercase mb-1 flex items-center gap-1">
        {label} {isHint && <Zap size={10} className="text-yellow-300" />}
      </span>
      <span className="text-center w-full flex flex-wrap items-center justify-center gap-1 leading-tight break-words whitespace-normal px-0.5">
        {valStr} {arrow}
      </span>
    </div>
  );
});

// --- COMPONENTS D'ANIMATION & UI ---

const Confetti = ({ active }: { active: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles: any[] = [];
    const colors = ['#f97316', '#22c55e', '#eab308', '#3b82f6', '#ef4444'];
    
    for (let i = 0; i < 150; i++) {
      particles.push({
        x: canvas.width / 2, y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15,
        size: Math.random() * 8 + 2, color: colors[Math.floor(Math.random() * colors.length)], life: 100
      });
    }
    const animate = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let activeParticles = 0;
      particles.forEach(p => {
        if (p.life > 0) {
          p.x += p.vx; p.y += p.vy; p.vy += 0.2; p.life--; activeParticles++;
          ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
        }
      });
      if (activeParticles > 0) requestAnimationFrame(animate);
    };
    animate();
  }, [active]);
  if (!active) return null;
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[100]" />;
};

const StageTimer = ({ isActive, onTick }: { isActive: boolean, onTick: (s: number) => void }) => {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let interval: any = null;
    if (isActive) {
      interval = setInterval(() => { setSeconds(s => s + 1); }, 1000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isActive]);

  useEffect(() => { onTick(seconds); }, [seconds, onTick]);

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="font-mono text-xl text-yellow-400 font-bold bg-slate-950 px-3 py-1 rounded border border-slate-700 flex items-center gap-2">
      <Clock size={18} />
      {formatTime(seconds)}
    </div>
  );
};

const DailyCountdown = () => {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);
      setTimeLeft(`${h}h ${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="font-mono text-xl text-orange-400 font-bold">{timeLeft}</div>;
};

// --- COMPOSANTS DE NIVEAU SPÉCIFIQUES ---

const LevelIconView = ({ target, lives }: { target: Activity, lives: number }) => {
  const blurAmount = Math.max(0, (lives - 1) * 2); 
  return (
    <div className="flex flex-col items-center justify-center mb-8">
      <div className="text-orange-400 font-bold mb-2 uppercase tracking-widest text-xs">Identifiez l'activité via son icône</div>
      <div className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden relative shadow-[0_0_30px_rgba(255,255,255,0.1)] transition-all duration-500">
        <div 
            className="text-slate-900 font-bold text-6xl select-none transition-all duration-500"
            style={{ filter: `blur(${blurAmount}px)` }}
        >
             {target.name.substring(0, 2).toUpperCase()}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">Flou actuel : {blurAmount}px</div>
    </div>
  );
};

// NIVEAU 3: REBUS
const LevelRebusView = ({ target, lives }: { target: Activity, lives: number }) => {
  const todayKey = useMemo(() => getTodayKey(), []);
  
  const rebusString = useMemo(() => {
      if (target.rebus_variations && target.rebus_variations.length > 0) {
          const seed = simpleHash(todayKey + target.name);
          const index = seed % target.rebus_variations.length;
          return target.rebus_variations[index];
      }
      return target.rebus || "❓ ❓ ❓ ❓ ❓";
  }, [target, todayKey]);

  const emojis = rebusString.split(/\s+/).filter(Boolean);
  const displayEmojis = emojis.length >= 5 ? emojis : [...emojis, ...Array(5-emojis.length).fill("❓")];

  const lostLives = 10 - lives;
  const revealedCount = Math.min(5, 1 + lostLives);

  return (
    <div className="flex flex-col items-center justify-center mb-8">
      <div className="text-orange-400 font-bold mb-4 uppercase tracking-widest text-xs flex items-center gap-2">
        <Brain size={16}/> Déchiffrez le Rébus
      </div>
      
      <div className="flex gap-2 md:gap-4">
        {displayEmojis.slice(0, 5).map((emojiChar, idx) => {
           const isVisible = idx < revealedCount;
           return (
             <div 
               key={idx}
               className={`
                 w-12 h-14 md:w-16 md:h-20 rounded-xl flex items-center justify-center text-2xl md:text-4xl border-b-4 transition-all duration-500
                 ${isVisible 
                   ? 'bg-slate-800 border-slate-600 text-white shadow-lg transform scale-100' 
                   : 'bg-slate-900 border-slate-800 text-slate-700 shadow-none transform scale-95'}
               `}
             >
               {isVisible ? emojiChar : <span className="text-lg opacity-20">?</span>}
             </div>
           );
        })}
      </div>
      
      <div className="mt-4 text-xs text-slate-500 font-mono">
         {revealedCount < 5 ? "Un nouvel indice à chaque erreur" : "Tous les indices révélés !"}
      </div>
    </div>
  );
};

const LevelReverseView = ({ target, revealedHints }: any) => {
  return (
    <div className="flex flex-col items-center justify-center mb-8 w-full">
      <div className="text-orange-400 font-bold mb-4 uppercase tracking-widest text-xs">Trouvez l'activité correspondant à cette signature</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
         <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
            <span className="text-xs uppercase text-slate-500 font-bold mb-1">Input Type</span>
            <span className="text-xl font-mono text-blue-400 font-bold text-center break-all">{target.input}</span>
         </div>
         <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
            <span className="text-xs uppercase text-slate-500 font-bold mb-1">Output Type</span>
            <span className="text-xl font-mono text-purple-400 font-bold text-center break-all">{target.output}</span>
         </div>
         <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col items-center">
            <span className="text-xs uppercase text-slate-500 font-bold mb-1">Category</span>
            <span className="text-xl font-mono text-green-400 font-bold text-center break-all">{target.category}</span>
         </div>
      </div>
      <div className="mt-4 bg-slate-900/50 p-4 rounded-lg border border-dashed border-slate-700 max-w-2xl w-full text-center">
         <span className="text-slate-400 italic">"{target.description}"</span>
      </div>
    </div>
  );
};

const LevelUltimateView = ({ target, lives }: { target: Activity, lives: number }) => {
  const maxKeywords = target.keywords ? target.keywords.length : 0;
  const revealedCount = Math.max(1, Math.ceil(((11 - lives) / 10) * maxKeywords));
  
  return (
    <div className="flex flex-col items-center justify-center mb-8 w-full">
       <div className="text-orange-400 font-bold mb-4 uppercase tracking-widest text-xs">Mode Ultimate : Mots Clés</div>
       <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          {target.keywords?.map((kw, idx) => {
             const isVisible = idx < revealedCount;
             return (
               <div key={idx} className={`px-4 py-2 rounded-full font-bold transition-all duration-500 ${isVisible ? 'bg-slate-100 text-slate-900 scale-100' : 'bg-slate-800 text-slate-800 scale-90 blur-sm select-none'}`}>
                 {isVisible ? kw : '?????'}
               </div>
             )
          })}
       </div>
       <div className="mt-4 text-xs text-slate-500">Mots révélés : {revealedCount}/{maxKeywords}</div>
    </div>
  );
};

const LevelBossView = ({ health, onDamage }: any) => {
    // Si vous utilisez le code localement, assurez-vous d'avoir l'image dans public/images/
    const BOSS_IMAGE_URL = "/images/manager.png"; 
  
    return (
      <div className="flex flex-col items-center justify-center mb-8 w-full animate-fade-in">
        <div className="text-red-500 font-black mb-4 uppercase tracking-widest text-xl animate-pulse">☠️ FINAL BOSS : LE MANAGER ☠️</div>
        
        <div onClick={onDamage} className="relative cursor-pointer group transition-transform active:scale-95">
          <div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-red-600 shadow-[0_0_50px_rgba(220,38,38,0.6)] relative z-10 hover:shadow-[0_0_70px_rgba(220,38,38,0.8)] transition-shadow">
            <img src={BOSS_IMAGE_URL} alt="Méchant Manager" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-red-500 mix-blend-overlay opacity-0 group-active:opacity-40 transition-opacity"></div>
          </div>
          <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs font-bold px-3 py-1 rounded-full border border-slate-600 z-20">
             CLIQUEZ POUR ATTAQUER !
          </div>
        </div>
  
        <div className="w-full max-w-md mt-8">
           <div className="flex justify-between text-xs font-bold uppercase mb-1">
              <span className="text-red-500">HP Manager</span>
              <span className="text-white">{health}%</span>
           </div>
           <div className="h-6 bg-slate-800 rounded-full border border-slate-700 overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-red-600 to-red-500 transition-all duration-100 ease-out" style={{ width: `${health}%` }}></div>
              <div className="absolute inset-0 bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAADCAYAAABS3WWCAAAAE0lEQVQIW2NkYGD4z8DAwMgAAQAAYgcDAOwv7AAAAABJRU5ErkJggg==')] opacity-20 pointer-events-none"></div>
           </div>
        </div>
      </div>
    );
};


// --- COMPOSANT PRINCIPAL ---
export default function UiPathdle() {
  const [dailyTargets, setDailyTargets] = useState<Activity[]>([]);
  
  // Game State
  const [currentStage, setCurrentStage] = useState(0); 
  const [lives, setLives] = useState(MAX_LIVES);
  const [guesses, setGuesses] = useState<Activity[]>([]); 
  const [stageStatus, setStageStatus] = useState("playing");
  const [isDailyComplete, setIsDailyComplete] = useState(false);
  const [currentSearch, setCurrentSearch] = useState("");
  
  // Features State
  const [attemptsSinceHint, setAttemptsSinceHint] = useState(0);
  const [revealedHints, setRevealedHints] = useState<string[]>([]); 
  const [stageTime, setStageTime] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);

  // Boss State
  const [bossHealth, setBossHealth] = useState(100);

  // Initialisation
  useEffect(() => {
    const today = getTodayKey();
    const targets = getDailyTargets(today);
    setDailyTargets(targets);

    const savedState = localStorage.getItem(`uipathdle_boss_${today}`);
    if (savedState) {
      const state = JSON.parse(savedState);
      setCurrentStage(state.currentStage);
      setLives(state.lives);
      setGuesses(state.guesses);
      setStageStatus(state.stageStatus);
      setIsDailyComplete(state.isDailyComplete);
      setAttemptsSinceHint(state.attemptsSinceHint || 0);
      setRevealedHints(state.revealedHints || []);
      setStageTime(state.stageTime || 0);
      setTotalScore(state.totalScore || 0);
      setBossHealth(state.bossHealth !== undefined ? state.bossHealth : 100);
    } else {
      resetStage(0);
    }
  }, []);

  // Sauvegarde
  useEffect(() => {
    const today = getTodayKey();
    if (dailyTargets.length > 0) {
      const state = {
        currentStage, lives, guesses, stageStatus, isDailyComplete,
        attemptsSinceHint, revealedHints, stageTime, totalScore, bossHealth
      };
      localStorage.setItem(`uipathdle_boss_${today}`, JSON.stringify(state));
    }
  }, [currentStage, lives, guesses, stageStatus, isDailyComplete, dailyTargets, attemptsSinceHint, revealedHints, stageTime, totalScore, bossHealth]);

  const resetStage = (stageIndex: number) => {
    setCurrentStage(stageIndex);
    setLives(MAX_LIVES);
    setGuesses([]);
    setStageStatus("playing");
    setAttemptsSinceHint(0);
    setRevealedHints([]);
    setStageTime(0);
    setBossHealth(100); // Reset boss health
    setShowConfetti(false);
    if (stageIndex === 0) {
      setIsDailyComplete(false);
      setTotalScore(0);
    }
  };

  const currentTarget = dailyTargets[currentStage];

  const handleGuess = (activity: Activity) => {
    if (stageStatus !== "playing" || isDailyComplete) return;

    const newGuesses = [activity, ...guesses];
    setGuesses(newGuesses);
    setCurrentSearch("");

    if (activity.name === currentTarget.name) {
      setStageStatus("won");
      setShowConfetti(true);
      
      const timePenalty = stageTime * 10;
      const lifeBonus = lives * 500;
      const stageScore = Math.max(0, 1000 - timePenalty) + lifeBonus;
      setTotalScore(prev => prev + stageScore);
    } else {
      const newLives = lives - 1;
      setLives(newLives);
      setAttemptsSinceHint(prev => prev + 1);
      if (newLives === 0) setStageStatus("lost");
    }
  };

  // Gestion des dégats sur le boss
  const handleBossDamage = () => {
      if (stageStatus !== "playing") return;
      
      const damage = 5;
      const newHealth = Math.max(0, bossHealth - damage);
      setBossHealth(newHealth);

      if (newHealth <= 0) {
          setStageStatus("won");
          setShowConfetti(true);
          // Bonus de score pour le boss
          setTotalScore(prev => prev + 5000); 
      }
  };

  const handleNextStage = () => {
    if (currentStage < STAGE_COUNT - 1) {
      resetStage(currentStage + 1);
    } else {
      setIsDailyComplete(true);
      setShowConfetti(true); 
    }
  };

  const unlockHint = () => {
    // CORRECTION : Débloqué si lives <= 9 (dès la première erreur, car max=10) ou tentatives >= 2
    if (lives > MAX_LIVES - 1 && attemptsSinceHint < ATTEMPTS_FOR_HINT) return;

    const allKeys = ['package', 'category', 'type', 'input', 'output'];
    const availableKeys = allKeys.filter(k => !revealedHints.includes(k));

    if (availableKeys.length > 0) {
      const randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
      setRevealedHints([...revealedHints, randomKey]);
      setLives(prev => prev - 1); 
      // Reset attempts not needed anymore for disabling, but good for logic
      setAttemptsSinceHint(0); 
    }
  };

  const copyToClipboard = () => {
    let resultText = `UiPathdle Ultimate ${getTodayKey()}\nScore: ${totalScore} pts\n\n`;
    resultText += `Stage ${currentStage + 1}/${STAGE_COUNT} : `;
    if (stageStatus === "won") {
      resultText += "🏆 " + "🟩".repeat(Math.ceil(lives / 2)) + "⬜".repeat(5 - Math.ceil(lives / 2));
    } else {
      resultText += "💀 Failed";
    }
    resultText += `\n\nJouez sur uipathdle.com`;

    const textArea = document.createElement("textarea");
    textArea.value = resultText;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      alert("Copié !");
    } catch (err) {
      console.error('Erreur copie', err);
    }
    document.body.removeChild(textArea);
  };

  const filteredActivities = useMemo(() => {
    if (!currentSearch) return [];
    return ACTIVITIES_DB.filter(
      act => 
        act.name.toLowerCase().includes(currentSearch.toLowerCase()) &&
        !guesses.some(g => g.name === act.name)
    ).slice(0, 5);
  }, [currentSearch, guesses]);

  // SUPPRESSION DE 'YEAR' DANS LES INDICES
  const attributesMap = [
    { key: 'package', label: 'Package' },
    { key: 'category', label: 'Catégorie' },
    { key: 'type', label: 'Type' },
    { key: 'input', label: 'Input' },
    { key: 'output', label: 'Output' },
    // Année supprimée comme demandé
  ];

  if (!currentTarget) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-orange-500 font-mono">LOADING...</div>;

  const canUnlockHint = attemptsSinceHint >= ATTEMPTS_FOR_HINT && lives > 1;
  const remainingAttempts = Math.max(0, ATTEMPTS_FOR_HINT - attemptsSinceHint);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-4 md:p-8 flex flex-col items-center">
      
      <Confetti active={showConfetti} />

      {/* --- HUD --- */}
      <div className="w-full max-w-4xl mb-6 bg-slate-800/50 p-4 rounded-xl border-2 border-slate-700 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#444 1px, transparent 1px), linear-gradient(90deg, #444 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
        <div className="flex flex-col md:flex-row justify-between items-center relative z-10 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-orange-600 rounded flex items-center justify-center font-black text-white text-xl shadow-[0_0_15px_rgba(234,88,12,0.5)]">Ui</div>
            <div>
              <h1 className="font-black text-2xl tracking-tighter text-white leading-none">PATHDLE <span className="text-orange-500">ULTIMATE</span></h1>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mt-1">
                 <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700">LVL {currentStage + 1}/{STAGE_COUNT}</span>
                 <span className="flex items-center gap-1 text-yellow-400 font-bold"><Trophy size={12}/> {totalScore} pts</span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center">
             <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Time</div>
             <StageTimer isActive={stageStatus === 'playing' && !isDailyComplete} onTick={setStageTime} key={currentStage} />
          </div>
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Energy</div>
            <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-lg border border-slate-700 shadow-inner">
               {[...Array(MAX_LIVES)].map((_, i) => (
                 <Heart key={i} size={16} className={`transition-all duration-300 ${i < lives ? 'fill-red-500 text-red-500 drop-shadow-[0_0_3px_rgba(239,68,68,0.8)]' : 'fill-slate-800 text-slate-800'}`} />
               ))}
            </div>
          </div>
        </div>
      </div>

      {/* --- LEVEL TITLE --- */}
      {!isDailyComplete && (
         <div className="mb-4 flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-full border border-slate-600">
            {currentStage === 0 && <><Box className="text-blue-400" size={18}/> <span className="font-bold">Niveau 1 : Classic</span></>}
            {currentStage === 1 && <><Eye className="text-purple-400" size={18}/> <span className="font-bold">Niveau 2 : Icon Blur</span></>}
            {currentStage === 2 && <><Brain className="text-yellow-400" size={18}/> <span className="font-bold">Niveau 3 : Rébus</span></>}
            {currentStage === 3 && <><Code className="text-green-400" size={18}/> <span className="font-bold">Niveau 4 : Reverse Quiz</span></>}
            {currentStage === 4 && <><Hash className="text-red-400" size={18}/> <span className="font-bold">Niveau 5 : Ultimate</span></>}
            {currentStage === 5 && <><Sword className="text-red-600" size={18}/> <span className="font-bold text-red-500 animate-pulse">Niveau 6 : BOSS BATTLE</span></>}
         </div>
      )}

      {/* --- VICTOIRE / DEFAITE MODALES --- */}
      {stageStatus === "won" && !isDailyComplete && (
        <div className="w-full max-w-xl bg-green-900/40 border-2 border-green-500 rounded-xl p-6 mb-6 text-center animate-bounce-in backdrop-blur-sm relative overflow-hidden">
           <div className="absolute top-0 right-0 p-4 opacity-20"><Sparkles size={64} className="text-white"/></div>
           
           {/* Message Spécial Boss */}
           {currentStage === 5 ? (
              <>
                 <h3 className="text-4xl font-black text-yellow-400 mb-2 uppercase italic drop-shadow-lg">VICTOIRE LÉGENDAIRE !</h3>
                 <p className="mb-4 text-white font-bold text-xl">BRAVO tu as vaincu le méchant manager !</p>
                 <div className="text-6xl mb-4">🥳💼🔥</div>
              </>
           ) : (
              <>
                 <h3 className="text-3xl font-black text-green-400 mb-2 uppercase italic">Niveau Réussi !</h3>
                 <p className="mb-4 text-slate-300">Activité trouvée : <span className="font-bold text-white">{currentTarget.name}</span></p>
              </>
           )}

           <div className="flex gap-2 justify-center">
             <button onClick={copyToClipboard} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded flex items-center gap-2 transition-all border border-slate-500"><Share2 size={18}/> Share</button>
             <button onClick={handleNextStage} className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded flex items-center gap-2 transition-all shadow-[0_4px_0_rgb(21,128,61)] active:translate-y-1 active:shadow-none">NEXT LEVEL <ArrowRight size={20}/></button>
           </div>
        </div>
      )}

      {stageStatus === "lost" && !isDailyComplete && (
        <div className="w-full max-w-xl bg-red-900/40 border-2 border-red-500 rounded-xl p-6 mb-6 text-center animate-bounce-in backdrop-blur-sm">
           <h3 className="text-3xl font-black text-red-500 mb-2 uppercase italic">Échec Critique</h3>
           <p className="mb-4 text-slate-300">Réponse : <span className="font-bold text-white">{currentTarget.name}</span></p>
           <button onClick={handleNextStage} className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-8 rounded flex items-center gap-2 mx-auto transition-all shadow-[0_4px_0_rgb(51,65,85)] active:translate-y-1 active:shadow-none">CONTINUE <ArrowRight size={20}/></button>
        </div>
      )}

      {isDailyComplete && (
         <div className="w-full max-w-xl bg-slate-800 border-2 border-orange-500 rounded-xl p-8 mb-6 text-center animate-bounce-in shadow-[0_0_50px_rgba(234,88,12,0.2)]">
            <h3 className="text-4xl font-black text-white mb-2 italic">CAMPAGNE TERMINÉE</h3>
            <div className="text-3xl font-mono text-yellow-400 mb-6 font-bold flex items-center justify-center gap-2"><Trophy className="text-yellow-400"/> {totalScore} PTS</div>
            <button onClick={copyToClipboard} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-full flex items-center gap-2 mx-auto mb-6 transition-all shadow-[0_4px_0_rgb(37,99,235)] active:translate-y-1 active:shadow-none"><Share2 size={20}/> Partager mon Score</button>
            <div className="bg-slate-900 rounded p-4 border border-slate-700 inline-block">
                <div className="text-xs text-orange-400 uppercase font-bold mb-1">Prochaine Mission</div>
                <DailyCountdown />
            </div>
         </div>
      )}

      {/* --- ZONE DE JEU ACTIVE --- */}
      {stageStatus === "playing" && !isDailyComplete && (
        <div className="w-full max-w-xl relative mb-8 z-50 flex flex-col gap-4">
          
          {/* VUE DU NIVEAU COURANT */}
          <div className="w-full">
             {currentStage === 1 && <LevelIconView target={currentTarget} lives={lives} />}
             {currentStage === 2 && <LevelRebusView target={currentTarget} lives={lives} />}
             {currentStage === 3 && <LevelReverseView target={currentTarget} revealedHints={revealedHints} />}
             {currentStage === 4 && <LevelUltimateView target={currentTarget} lives={lives} />}
             {/* STAGE 5 (Index 5) = BOSS */}
             {currentStage === 5 && <LevelBossView health={bossHealth} onDamage={handleBossDamage} />}
          </div>

          {/* BARRE D'INDICES (Cachée pour le Boss) */}
          {currentStage !== 5 && (
            <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase flex items-center gap-1"><Unlock size={12}/> Attributs Débloqués</span>
                    <button 
                    onClick={unlockHint}
                    disabled={!canUnlockHint}
                    className={`text-[10px] md:text-xs font-bold px-3 py-1 rounded flex items-center gap-2 transition-all border ${canUnlockHint ? 'bg-yellow-600/20 text-yellow-400 border-yellow-500/50 hover:bg-yellow-600 hover:text-white cursor-pointer animate-pulse' : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed opacity-50'}`}
                    >
                    <HelpCircle size={12}/> 
                    {canUnlockHint ? "INDICE DISPO !" : `Indice (-1 Vie) • Encore ${remainingAttempts} erreurs`}
                    </button>
                </div>
                {/* GRID 5 COLONNES (Sans Année) */}
                <div className="grid grid-cols-5 gap-1">
                    {attributesMap.map((attr) => {
                    const isRevealed = revealedHints.includes(attr.key);
                    return (
                        <div key={attr.key} className={`h-12 rounded flex flex-col items-center justify-center text-[10px] border transition-all ${isRevealed ? 'bg-green-900/50 border-green-500/50 text-green-300' : 'bg-slate-900 border-slate-800 text-slate-700'}`}>
                        <span className="uppercase text-[8px] opacity-70 mb-0.5">{attr.label}</span>
                        {isRevealed ? <span className="font-bold text-white text-[9px] text-center leading-none px-1 overflow-hidden">{currentTarget[attr.key as keyof Activity]}</span> : <Lock size={10} />}
                        </div>
                    )
                    })}
                </div>
            </div>
          )}

          {/* BARRE DE RECHERCHE (Cachée pour le Boss) */}
          {currentStage !== 5 && (
            <div className="relative">
                <input
                type="text"
                className="w-full bg-slate-800 border-2 border-slate-600 focus:border-orange-500 rounded-lg py-4 px-12 text-white outline-none transition-all shadow-lg font-mono text-lg placeholder:text-slate-600"
                placeholder={`Devinez l'activité...`}
                value={currentSearch}
                onChange={(e) => setCurrentSearch(e.target.value)}
                autoFocus
                />
                <Search className="absolute left-4 top-5 text-slate-500" size={20} />
                {filteredActivities.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border-2 border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto custom-scrollbar z-50">
                    {filteredActivities.map((act) => (
                    <button key={act.name} onClick={() => handleGuess(act)} className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center justify-between group transition-colors border-b border-slate-800 last:border-0">
                        <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-700 flex items-center justify-center text-xs text-white font-bold font-mono border border-slate-600">{act.name.substring(0,2).toUpperCase()}</div>
                        <span className="font-semibold text-slate-200 group-hover:text-white font-mono">{act.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider bg-slate-950 px-2 py-1 rounded border border-slate-800">{act.package}</span>
                    </button>
                    ))}
                </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* --- HISTORIQUE DES ESSAIS (Caché pour le Boss) --- */}
      {currentStage !== 5 && (
        <div className="w-full max-w-5xl space-y-2">
            {/* EN-TÊTE DE LA GRILLE */}
            <div className="hidden md:grid grid-cols-6 gap-3 px-3 mb-1 text-[10px] uppercase font-bold text-slate-500 tracking-widest text-center">
               <div className="col-span-1 text-left pl-14">Activité</div>
               <div>Package</div>
               <div>Catégorie</div>
               <div>Type</div>
               <div>Input</div>
               <div>Output</div>
            </div>

            {guesses.map((guess) => {
              // Vérification "Presque ça" : Tous les attributs affichés correspondent (sauf le nom)
              const isAttributesMatch = 
                 guess.package === currentTarget.package &&
                 guess.category === currentTarget.category &&
                 guess.type === currentTarget.type &&
                 guess.input === currentTarget.input &&
                 guess.output === currentTarget.output;
              
              const isNameMatch = guess.name === currentTarget.name;
              
              return (
                <div key={guess.name} className="flex flex-col mb-2">
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3 mb-1"> {/* 6 Colonnes */}
                        <div className="col-span-2 md:col-span-1 flex items-center justify-center p-3 bg-slate-800 rounded-lg border border-slate-700 shadow-sm animate-flip min-h-[70px]">
                        <div className="flex flex-col items-center"><span className="font-bold text-white text-center leading-tight">{guess.name}</span></div>
                        </div>
                        <AttributeCell label="Package" value={guess.package} targetValue={currentTarget.package} delay={100} />
                        <AttributeCell label="Catégorie" value={guess.category} targetValue={currentTarget.category} delay={200} />
                        <AttributeCell label="Type" value={guess.type} targetValue={currentTarget.type} delay={300} />
                        <AttributeCell label="Input" value={guess.input} targetValue={currentTarget.input} delay={400} />
                        <AttributeCell label="Output" value={guess.output} targetValue={currentTarget.output} delay={500} />
                    </div>
                    {/* AFFICHAGE DESCRIPTION SI "PRESQUE ÇA" - Affiche currentTarget.description quand tout est vert sauf le nom */}
                    {isAttributesMatch && !isNameMatch && currentTarget.description && (
                        <div className="w-full bg-slate-800/80 border-l-4 border-yellow-500 p-2 rounded-r text-xs text-slate-300 italic animate-fade-in mx-1 mt-1">
                             <span className="text-yellow-500 font-bold not-italic mr-2">ℹ️ INDICE (Cible) :</span>
                             "{currentTarget.description}"
                        </div>
                    )}
                </div>
              );
            })}
        </div>
      )}

      {/* --- BOUTON DE RESET (Supprimé comme demandé) --- */}

      <style>{`
        @keyframes flip { 0% { transform: rotateX(90deg); opacity: 0; } 100% { transform: rotateX(0deg); opacity: 1; } }
        .animate-flip { animation-name: flip; animation-fill-mode: backwards; }
        .animate-bounce-subtle { animation: bounce 2s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(-5%); } 50% { transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0f172a; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        @keyframes fade-in { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
}
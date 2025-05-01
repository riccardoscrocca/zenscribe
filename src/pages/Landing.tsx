import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot as Lotus, Brain, Mic, FileText, ArrowRight, Users, Lock, Clock, CheckCircle, ArrowUpRight, Shield, Sparkles, Headphones, Building, Mail, ChevronDown, Plus, Minus, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { STRIPE_PRODUCTS } from '../lib/stripe-config';

export function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursorPosition, setCursorPosition] = useState({ x: -100, y: -100 });
  const [isHovering, setIsHovering] = useState(false);
  const [trails, setTrails] = useState<{ x: number; y: number; id: number }[]>([]);
  const trailsRef = useRef<{ x: number; y: number; id: number }[]>([]);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const requestRef = useRef<number>();
  const featuresRef = useRef<HTMLElement>(null);
  const whyChooseRef = useRef<HTMLElement>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const plans = [
    {
      name: 'Free',
      price: 0,
      minutes: '30',
      features: [
        'Fino a 30 minuti di registrazione al mese',
        'Trascrizione automatica',
        'Report medici in PDF',
        'Accesso a 1 utente'
      ],
      icon: Clock,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      buttonColor: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
      priceId: null
    },
    {
      name: 'Basic',
      price: 99,
      minutes: '600',
      features: [
        'Fino a 600 minuti di registrazione al mese',
        'Trascrizione automatica',
        'Report medici in PDF',
        'Accesso per 1 utente',
        'Esportazione dati',
        'Backup automatico',
        '7 giorni di prova gratuita'
      ],
      icon: FileText,
      color: 'text-teal-600',
      bgColor: 'bg-teal-100',
      buttonColor: 'bg-teal-600 text-white hover:bg-teal-700',
      priceId: STRIPE_PRODUCTS.BASIC.priceId,
      popular: true
    },
    {
      name: 'Advanced',
      price: 199,
      minutes: '1200',
      features: [
        'Fino a 1200 minuti di registrazione al mese',
        'Trascrizione automatica',
        'Report medici in PDF',
        'Accesso a 5 utenti',
        'Supporto email e telefonico prioritario',
        'Esportazione dati avanzata',
        'Backup automatico',
        'Dashboard analytics'
      ],
      icon: Brain,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
      buttonColor: 'bg-emerald-600 text-white hover:bg-emerald-700',
      priceId: STRIPE_PRODUCTS.ADVANCED.priceId
    },
    {
      name: 'Enterprise',
      price: null,
      minutes: 'Illimitati',
      features: [
        'Minuti di registrazione illimitati',
        'Trascrizione automatica',
        'Report medici in PDF personalizzabili',
        'Utenti illimitati',
        'Account manager dedicato',
        'Supporto prioritario 24/7',
        'Branding personalizzato',
        'Dashboard analytics avanzato',
        'Integrazione sistemi esistenti',
        'Training personalizzato'
      ],
      icon: Building,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-100',
      buttonColor: 'bg-indigo-600 text-white hover:bg-indigo-700',
      priceId: 'contact'
    }
  ];

  const faqs = [
    {
      question: "Come funziona ZenScribe.ai?",
      answer: "ZenScribe.ai registra le tue consultazioni mediche e utilizza l'intelligenza artificiale per trascriverle automaticamente. Il testo viene poi analizzato e strutturato in un report clinico professionale, organizzando le informazioni in sezioni chiare e pertinenti."
    },
    {
      question: "Quanto tempo posso risparmiare?",
      answer: "I nostri utenti risparmiano in media il 60% del tempo dedicato alla documentazione clinica. Una consultazione di 30 minuti richiede tipicamente solo 5-10 minuti per la revisione del report generato automaticamente."
    },
    {
      question: "I dati sono al sicuro?",
      answer: "Assolutamente sì. Utilizziamo la crittografia end-to-end e rispettiamo rigorosamente il GDPR. Tutti i dati sono archiviati in server europei conformi alle normative sulla privacy sanitaria."
    },
    {
      question: "Posso provarlo gratuitamente?",
      answer: "Sì! Offriamo una prova gratuita di 7 giorni con tutte le funzionalità del piano Basic. Non è richiesta carta di credito per iniziare."
    }
  ];

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let time = 0;
    const waves = 3;
    const amplitude = 20;
    const frequency = 0.01;
    const speed = 0.005;

    const animate = () => {
      if (!canvas || !ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let wave = 0; wave < waves; wave++) {
        const phaseShift = wave * (2 * Math.PI / waves);
        const opacity = 0.08 - wave * 0.02;
        ctx.strokeStyle = `rgba(45, 212, 191, ${opacity})`;
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let x = 0; x < canvas.width; x++) {
          const y = canvas.height / 2 + 
                    Math.sin(x * frequency + time + phaseShift) * amplitude * 
                    Math.sin(time * 0.2);

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            const prevX = x - 1;
            const prevY = canvas.height / 2 + 
                         Math.sin(prevX * frequency + time + phaseShift) * amplitude * 
                         Math.sin(time * 0.2);
            const cpX = (x + prevX) / 2;
            const cpY = (y + prevY) / 2;
            ctx.quadraticCurveTo(cpX, cpY, x, y);
          }
        }
        ctx.stroke();
      }

      time += speed;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleSubscribe = async (planKey: string) => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (planKey === 'Enterprise') {
      window.location.href = 'mailto:info@level-up.agency?subject=Enterprise Plan Inquiry';
      return;
    }

    try {
      setSubscribing(true);
      setError(null);

      if (planKey === 'Basic' && STRIPE_PRODUCTS.BASIC.paymentLink) {
        window.location.href = STRIPE_PRODUCTS.BASIC.paymentLink;
        return;
      }

      if (planKey === 'Advanced' && STRIPE_PRODUCTS.ADVANCED.paymentLink) {
        window.location.href = STRIPE_PRODUCTS.ADVANCED.paymentLink;
        return;
      }

      const priceId = planKey === 'Basic' 
        ? STRIPE_PRODUCTS.BASIC.priceId 
        : STRIPE_PRODUCTS.ADVANCED.priceId;

      window.location.href = `https://checkout.stripe.com/c/pay/${priceId}`;
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      console.error('Subscription error:', error);
    } finally {
      setSubscribing(false);
    }
  };

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50 to-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-sm z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Lotus className="h-8 w-8 text-teal-600" />
              <div className="ml-2 font-bold text-2xl">
                <span className="text-teal-600">Zen</span>
                <span className="text-gray-700">Scribe</span>
                <span className="text-gray-500 text-xl">.ai</span>
              </div>
            </div>
            <nav className="hidden md:flex space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900">Funzionalità</a>
              <a href="#how-it-works" className="text-gray-600 hover:text-gray-900">Come Funziona</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900">Prezzi</a>
            </nav>
            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition-colors"
            >
              Accedi
              <ArrowRight className="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative min-h-screen flex items-center justify-center py-32 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <canvas
          ref={waveformRef}
          className="absolute inset-0 w-full h-full opacity-20"
          style={{ width: '100%', height: '100%' }}
        />

        <div className="max-w-7xl mx-auto relative">
          <div className="text-center">
            <div className="flex justify-center mb-8 animate-float">
              <Lotus className="h-24 w-24 text-teal-600" />
            </div>
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-gray-900 tracking-tight mb-8">
              <div className="animate-slide-left inline-block">
                Con <span className="text-teal-600">ZenScribe</span>,
              </div>
              <div className="animate-slide-right inline-block animate-delay-100">
                trascrivi e sintetizzi
              </div>
              <div className="animate-fade-in animate-delay-200">
                ogni visita senza stress.
              </div>
            </h1>
            <p className="text-2xl md:text-3xl text-gray-600 max-w-4xl mx-auto mb-8 animate-fade-in animate-delay-300">
              Tu ti concentri sui pazienti. Il resto lo fa l'AI.
            </p>
            <p className="text-xl md:text-2xl text-gray-500 max-w-4xl mx-auto mb-12 animate-fade-in animate-delay-400">
              ZenScribeAi trasforma le tue consulenze vocali in testo strutturato,
              generando report clinici intelligenti e risparmiando fino al 60% del tempo
              di documentazione.
            </p>
            <div className="flex flex-col items-center gap-8">
              <button
                onClick={() => navigate('/login')}
                className="inline-flex items-center px-8 py-4 text-xl border border-transparent font-medium rounded-lg text-white bg-teal-600 hover:bg-teal-700 transition-all duration-300 transform hover:scale-105 animate-fade-in animate-delay-500"
              >
                Prova gratis per 7 giorni
                <ArrowUpRight className="ml-2 h-6 w-6" />
              </button>
              
              <button
                onClick={() => whyChooseRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="flex flex-col items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors animate-float-down"
              >
                <span className="text-sm">Scopri di più</span>
                <ChevronDown className="h-6 w-6" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Why Choose ZenScribe Section */}
      <section ref={whyChooseRef} className="py-20 bg-gradient-to-b from-white to-teal-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Perché Scegliere ZenScribe</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Semplifica il tuo lavoro con strumenti intelligenti progettati per i professionisti della salute
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="why-card">
              <div className="why-card-icon mb-6">
                <Clock className="h-8 w-8 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Risparmia Tempo
              </h3>
              <p className="text-gray-600">
                Riduci fino al 60% il tempo dedicato alla documentazione clinica.
                Più tempo per i tuoi pazienti, meno per la burocrazia.
              </p>
            </div>

            <div className="why-card">
              <div className="why-card-icon mb-6">
                <Brain className="h-8 w-8 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                AI Intelligente
              </h3>
              <p className="text-gray-600">
                La nostra AI comprende il contesto medico e genera report
                strutturati e professionali automaticamente.
              </p>
            </div>

            <div className="why-card">
              <div className="why-card-icon mb-6">
                <Shield className="h-8 w-8 text-teal-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Sicurezza Garantita
              </h3>
              <p className="text-gray-600">
                Crittografia end-to-end e conformità GDPR per proteggere
                i dati sensibili dei tuoi pazienti.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section ref={featuresRef} className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Funzionalità Principali</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Strumenti avanzati per ottimizzare la documentazione clinica
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-teal-100 text-teal-600 mb-6">
                <Mic className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Registrazione Consulenze
              </h3>
              <p className="text-gray-600">
                Registra le tue consulenze direttamente dal browser, senza bisogno di app
                esterne o dispositivi dedicati.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-teal-100 text-teal-600 mb-6">
                <Brain className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Analisi AI Avanzata
              </h3>
              <p className="text-gray-600">
                L'intelligenza artificiale identifica automaticamente sintomi, diagnosi,
                terapie e follow-up.
              </p>
            </div>

            <div className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center h-12 w-12 rounded-lg bg-teal-100 text-teal-600 mb-6">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Report Intelligenti
              </h3>
              <p className="text-gray-600">
                Genera report medici strutturati e professionali con un solo clic, pronti
                per essere archiviati o condivisi.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative py-20 bg-gray-50 overflow-hidden">
        {isHovering && (
          <>
            <div
              className={`cursor-glow ${isHovering ? 'active' : ''}`}
              style={{
                left: `${cursorPosition.x}px`,
                top: `${cursorPosition.y}px`
              }}
            />
            {trails.map((trail) => (
              <div
                key={trail.id}
                className="cursor-trail"
                style={{
                  left: `${trail.x}px`,
                  top: `${trail.y}px`,
                  opacity: 0.5
                }}
              />
            ))}
          </>
        )}
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Come Funziona</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Un processo semplice in quattro passaggi per trasformare le tue consulenze
              vocali in documenti clinici professionali
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: Mic,
                title: "1. Registra",
                description: "Registra la consulenza medica direttamente dal browser con controlli semplici.",
                color: "from-teal-100 to-teal-50"
              },
              {
                icon: FileText,
                title: "2. Trascrivi",
                description: "L'AI converte automaticamente l'audio in testo con precisione superiore al 98%.",
                color: "from-emerald-100 to-emerald-50"
              },
              {
                icon: Brain,
                title: "3. Analizza",
                description: "L'intelligenza artificiale identifica e categorizza elementi clinici rilevanti.",
                color: "from-green-100 to-green-50"
              },
              {
                icon: CheckCircle,
                title: "4. Report",
                description: "Genera automaticamente report clinici strutturati pronti all'uso.",
                color: "from-teal-100 to-teal-50"
              }
            ].map((step, index) => (
              <div 
                key={index}
                className={`opacity-0 animate-fade-up bg-white rounded-xl p-8 shadow-lg border border-gray-100 
                  transform transition-all duration-500 hover:scale-105 hover:shadow-xl`}
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="relative mb-6">
                  <div className={`absolute inset-0 bg-gradient-to-br ${step.color} rounded-full animate-pulse-slow`} />
                  <div className="relative h-16 w-16 rounded-full bg-gradient-to-br from-white to-gray-50 flex items-center justify-center animate-float">
                    <step.icon className="h-8 w-8 text-teal-600" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Scegli il Tuo Piano</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Tutti i piani includono le funzionalità base e supporto tecnico.
              Aggiorna in qualsiasi momento per accedere a più funzionalità.
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map(plan => {
              const Icon = plan.icon;
              const isCurrentPlan = false;
              const price = plan.price;
              
              return (
                <div
                  key={plan.name}
                  className={`relative rounded-xl p-6 border shadow-lg transition-all duration-500 hover:scale-105 hover:shadow-xl
                    ${plan.bgColor} ${plan.color} ${isCurrentPlan ? 'ring-2 ring-blue-500' : ''}`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 right-4">
                      <span className="inline-flex items-center bg-gradient-to-r from-blue-600 to-blue-500 text-white text-xs font-medium px-2.5 py-0.5 rounded-full shadow-lg whitespace-nowrap">
                        Piano Più Popolare
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-3 mb-6">
                    <div className={`rounded-full p-3 ${plan.bgColor}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className={`text-xl font-bold ${plan.color}`}>{plan.name}</span>
                  </div>

                  <div className="mb-6">
                    {plan.name === 'Enterprise' ? (
                      <p className="text-2xl font-bold text-gray-900">Su Richiesta</p>
                    ) : (
                      <>
                        <p className="text-4xl font-bold text-gray-900">
                          €{plan.price}
                          <span className="text-base font-normal text-gray-500">/mese</span>
                        </p>
                        {plan.name === 'Basic' && (
                          <p className="text-sm text-green-600 font-medium mt-2">
                            7 giorni di prova gratuita
                          </p>
                        )}
                      </>
                    )}
                    <p className="text-sm text-gray-500 mt-2">{plan.minutes} minuti al mese</p>
                  </div>

                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button 
                    onClick={() => !isCurrentPlan && handleSubscribe(plan.name)}
                    disabled={isCurrentPlan || subscribing}
                    className={`w-full rounded-lg px-4 py-3 font-medium transition-all duration-300 flex items-center justify-center gap-2
                      ${isCurrentPlan ? 'opacity-50 cursor-not-allowed' : 'transform hover:translate-y-[-2px]'} ${plan.buttonColor}`}
                  >
                    {subscribing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Attivazione...
                      </>
                    ) : isCurrentPlan ? (
                      'Piano Attuale'
                    ) : plan.name === 'Enterprise' ? (
                      <>
                        <Mail className="h-4 w-4" />
                        Contattaci
                      </>
                    ) : (
                      <>
                        Attiva Piano
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-gradient-to-b from-white to-teal-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Domande Frequenti</h2>
            <p className="text-xl text-gray-600">
              Trova le risposte alle domande più comuni su ZenScribe
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div key={index} className="bg-white rounded-xl shadow-sm border border-gray-100">
                <button
                  className="w-full text-left px-6 py-4 flex items-center justify-between"
                  onClick={() => toggleFaq(index)}
                >
                  <span className="font-medium text-gray-900">{faq.question}</span>
                  {openFaqIndex === index ? (
                    <Minus className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Plus className="h-5 w-5 text-gray-400" />
                  )}
                </button>
                {openFaqIndex === index && (
                  <div className="px-6 pb-4">
                    <p className="text-gray-600">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-teal-500 to-teal-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Pronto a trasformare la tua documentazione clinica?
          </h2>
          <p className="text-xl text-teal-100 mb-10 max-w-3xl mx-auto">
            Unisciti a migliaia di professionisti sanitari che utilizzano ZenScribeAi
            per risparmiare tempo e migliorare la qualità della documentazione.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="discover-button animate-gentle-bounce"
          >
            Scopri di più
            <ArrowUpRight className="ml-2 h-5 w-5" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <Lotus className="h-8 w-8 text-teal-400" />
                <div className="ml-2 font-bold text-2xl">
                  <span className="text-teal-400">Zen</span>
                  <span className="text-gray-200">Scribe</span>
                  <span className="text-gray-400 text-xl">.ai</span>
                </div>
              </div>
              <p className="text-gray-400">
                Trasforma le tue consulenze vocali in documentazione clinica professionale
                con l'aiuto dell'intelligenza artificiale.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Link Rapidi</h3>
              <ul className="space-y-2">
                <li>
                  <a href="#features" className="text-gray-400 hover:text-white">
                    Funzionalità
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-gray-400 hover:text-white">
                    Come Funziona
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="text-gray-400 hover:text-white">
                    Prezzi
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="text-gray-400 hover:text-white">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-4">Contatti</h3>
              <ul className="space-y-2">
                <li className="text-gray-400">
                  <a href="mailto:info@level-up.agency" className="hover:text-white">
                    <Mail className="inline-block h-4 w-4 mr-2" />
                    info@level-up.agency
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>© {new Date().getFullYear()} ZenScribeAi. Tutti i diritti riservati.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
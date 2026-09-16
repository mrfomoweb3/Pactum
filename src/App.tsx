import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle, Copy, LockKey,
  QrCode, ShieldCheck, Sparkle, UserCircle, Wallet, X,
} from '@phosphor-icons/react'
import { connectNimiq, ensureNimiqReady, payBond, walletErrorMessage } from './nimiq'
import { createPaymentIntent, verifyPayment, type PaymentIntent } from './api'

const demo = {
  publicId: 'ca-8f47-aurea',
  restaurant: 'Casa Aurea',
  date: 'Friday, 18 September',
  time: '8:00 PM',
  party: 4,
  nim: '0.01',
  luna: 1_000,
  address: import.meta.env.VITE_NIMIQ_PAYOUT_ADDRESS || 'NQ77 8CXK 0PR4 7T9N LSBM L861 UVNU 2UKY D1U6',
  policy: 'Cancel before 8:00 PM on the preceding day for a full bond refund. After that time, the restaurant may retain the bond.',
}

function Mark({ inverse = false }: { inverse?: boolean }) {
  return <Link to="/" className={`mark ${inverse ? 'mark--inverse' : ''}`} aria-label="Pactum home"><span>P</span><b>PACTUM</b></Link>
}

function Landing() {
  const navigate = useNavigate()
  return <div className="landing">
    <header className="site-nav">
      <Mark />
      <nav aria-label="Main navigation"><a href="#why">Why Pactum</a><a href="#how">How it works</a></nav>
      <button className="nav-cta" onClick={() => navigate(`/p/${demo.publicId}`)}>Open mini app <ArrowRight weight="bold" /></button>
    </header>

    <main>
      <section className="hero">
        <img className="hero__image" src="/pactum-dining-hero.png" alt="A table for four set for evening service" />
        <div className="hero__veil" />
        <div className="hero__content">
          <p className="eyebrow">A reservation bond, made gracious</p>
          <h1>A promise,<br/><em>kept.</em></h1>
          <p className="hero__sub">Secure a remarkable table with NIM. Keep the reservation—or pass it on, without a phone call.</p>
          <button className="button button--ivory" onClick={() => navigate(`/p/${demo.publicId}`)}>View a reservation <ArrowRight weight="bold" /></button>
        </div>
        <div className="hero__note"><span>PACTUM</span><p>/pak.tum/ <i>n.</i><br/>Latin — an agreement, compact, or promise.</p></div>
      </section>

      <section className="thesis" id="why">
        <div className="thesis__number">01</div>
        <div>
          <h2>The table is prepared.<br/>The promise should be, too.</h2>
          <p>For a fine-dining restaurant, a no-show is more than an empty chair. It is ingredients prepared, a team assembled, and an evening that cannot be resold.</p>
        </div>
        <blockquote>Card deposits protect the table, but too often trap the guest.</blockquote>
      </section>

      <section className="problem-grid">
        <article><span>For restaurants</span><h3>Certainty without the admin</h3><p>A direct NIM bond makes a guest’s commitment visible, verifiable, and free from chargeback ambiguity.</p></article>
        <article className="problem-grid__dark"><span>For guests</span><h3>Flexibility without the awkwardness</h3><p>Plans change. A signed transfer lets the right guest arrive—while the original payment record remains untouched.</p></article>
        <article className="problem-grid__photo"><img src="/pactum-dining-hero.png" alt="Fine dining table detail"/></article>
      </section>

      <section className="solution" id="how">
        <div className="solution__intro"><p>One clear agreement</p><h2>From commitment<br/>to welcome.</h2></div>
        <div className="steps">
          <article><strong>1</strong><div><h3>Create</h3><p>The restaurant sets the date, policy, party size, and NIM bond.</p></div></article>
          <article><strong>2</strong><div><h3>Secure</h3><p>The guest pays directly in Nimiq Pay and receives a verifiable pass.</p></div></article>
          <article><strong>3</strong><div><h3>Transfer</h3><p>If plans change, the holder signs the pass to another Nimiq address.</p></div></article>
          <article><strong>4</strong><div><h3>Welcome</h3><p>Staff validates the current pass, checks in, and applies the bond.</p></div></article>
        </div>
      </section>

      <section className="product-moment">
        <div className="product-copy"><p>Built inside Nimiq Pay</p><h2>The bond is real.<br/>The experience is human.</h2><p>NIM goes directly to the restaurant. Pactum verifies the transaction, remembers the current holder, and never touches a private key.</p><button className="text-link" onClick={() => navigate(`/p/${demo.publicId}`)}>Open the experience <ArrowRight /></button></div>
        <PhonePreview />
      </section>

      <section className="closing">
        <Sparkle weight="fill" />
        <h2>Protect the table.<br/><em>Respect the guest.</em></h2>
        <button className="button button--dark" onClick={() => navigate(`/p/${demo.publicId}`)}>Enter Pactum <ArrowRight weight="bold" /></button>
      </section>
    </main>
    <footer><Mark/><p>Private hospitality, made verifiable.</p><div><Link to="/privacy">Privacy</Link><a href="https://nimiq.com" target="_blank" rel="noreferrer">Powered by Nimiq</a></div></footer>
  </div>
}

function PhonePreview() {
  return <div className="phone" aria-label="Pactum reservation pass preview">
    <div className="phone__bar"><span>9:41</span><span>● ● ●</span></div>
    <div className="mini-top"><span className="mini-mark">P</span><span>Reservation secured</span><CheckCircle weight="fill"/></div>
    <div className="mini-card"><p>CASA AUREA</p><h3>Friday dinner</h3><div className="mini-date"><strong>18</strong><span>SEP<br/>8:00 PM</span></div><div className="mini-row"><span>Party</span><b>4 guests</b></div><div className="mini-row"><span>Bond</span><b>12.50 NIM</b></div><div className="mini-qr"><QrCode size={88}/></div><small>PASS · 01</small></div>
  </div>
}

type AppStep = 'review' | 'wallet' | 'confirm' | 'pending' | 'secured'

function MiniApp() {
  const [step, setStep] = useState<AppStep>('review')
  const [accepted, setAccepted] = useState(false)
  const [wallet, setWallet] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()

  const shortWallet = useMemo(() => wallet ? `${wallet.slice(0, 9)}…${wallet.slice(-5)}` : '', [wallet])

  async function connect() {
    setError(''); setStep('wallet')
    try {
      const account = await connectNimiq()
      const paymentIntent = await createPaymentIntent(demo.publicId, account.address)
      setWallet(account.address); setIntent(paymentIntent); setStep('confirm')
    } catch (caught) {
      setStep('review')
      setError(walletErrorMessage(caught, 'Open this reservation inside Nimiq Pay to connect a wallet and pay.'))
    }
  }

  async function pay() {
    setError(''); setStep('pending')
    try {
      if (!intent) throw new Error('The payment request expired. Connect your wallet again.')
      if (txHash) {
        const verified = await verifyPayment(demo.publicId, intent.id, txHash)
        if (!verified) throw new Error('Payment detected and still confirming. Do not pay again; check its status shortly.')
        setStep('secured')
        return
      }
      await ensureNimiqReady()
      const hash = await payBond({ recipient: intent.recipient, amountLuna: intent.amountLuna, dataReference: intent.dataReference })
      setTxHash(hash)
      let verified = false
      for (const delay of [0, 1500, 3000, 5000]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        verified = await verifyPayment(demo.publicId, intent.id, hash)
        if (verified) break
      }
      if (!verified) throw new Error('Payment detected and still confirming. Do not pay again; check its status shortly.')
      setStep('secured')
    } catch (caught) {
      setStep('confirm')
      setError(walletErrorMessage(caught, 'Nimiq Pay could not complete the payment. No reservation pass was issued.'))
    }
  }

  return <div className="app-shell">
    <header className="app-header"><button aria-label="Back" onClick={() => navigate('/')}><ArrowLeft /></button><Mark/><button aria-label="Account"><UserCircle /></button></header>
    <main className="bond-screen">
      {step !== 'secured' ? <>
        <div className="bond-heading"><p>CASA AUREA · RESERVATION BOND</p><h1>Your table is being held.</h1><span>Review the details before you make your promise.</span></div>
        <section className="reservation-card">
          <div className="reservation-card__brand"><span>CA</span><div><h2>{demo.restaurant}</h2><p>Contemporary dining · Lagos</p></div><ShieldCheck weight="fill"/></div>
          <div className="date-lockup"><span>SEP</span><strong>18</strong><div><b>{demo.date}</b><p>{demo.time} · {demo.party} guests</p></div></div>
          <div className="amount-row"><span>Reservation bond</span><strong>{demo.nim} <small>NIM</small></strong></div>
          <button className="policy-row" onClick={() => setSheetOpen(true)}><span><LockKey/> Cancellation policy</span><ArrowRight/></button>
        </section>
        <div className="notice"><ShieldCheck/><p>You are sending <b>{demo.nim} NIM directly to {demo.restaurant}</b> as a reservation bond. Pactum does not hold these funds.</p></div>
        {error && <div className="error-message" role="alert">{error}</div>}
        {step === 'review' && <label className="terms"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span><Check weight="bold"/></span><p>I understand the cancellation policy and agree to the reservation terms.</p></label>}
        {step === 'confirm' && <div className="wallet-chip"><Wallet weight="fill"/><span>Paying with <b>{shortWallet}</b></span><button onClick={() => {setWallet(''); setStep('review')}}>Change</button></div>}
        <div className="app-action">
          {step === 'review' && <button disabled={!accepted} className="button button--app" onClick={connect}>Secure this table <ArrowRight weight="bold"/></button>}
          {step === 'wallet' && <button disabled className="button button--app">Waiting for Nimiq Pay…</button>}
          {step === 'confirm' && <button className="button button--app" onClick={pay}>{txHash ? 'Check payment status' : `Confirm ${demo.nim} NIM`} <ArrowRight weight="bold"/></button>}
          {step === 'pending' && <button disabled className="button button--app">Confirming payment…</button>}
          <p><LockKey weight="fill"/> Confirmed securely in Nimiq Pay</p>
        </div>
      </> : <SecuredPass txHash={txHash}/>} 
    </main>
    {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}><aside className="sheet" onClick={e => e.stopPropagation()}><button className="sheet__close" onClick={() => setSheetOpen(false)}><X/></button><p>Cancellation policy</p><h2>A clear promise,<br/>in plain language.</h2><p>{demo.policy}</p><div><CheckCircle weight="fill"/><span>Funds return to the original payer when a full refund is approved.</span></div><button className="button button--app" onClick={() => setSheetOpen(false)}>I understand</button></aside></div>}
  </div>
}

function SecuredPass({ txHash }: { txHash: string }) {
  return <div className="secured">
    <div className="secured__seal"><Check weight="bold"/></div><p>RESERVATION SECURED</p><h1>Your table awaits.</h1><span>The restaurant has received your bond.</span>
    <section className="pass-card"><div className="pass-card__top"><span>PACTUM / 01</span><b>CASA AUREA</b></div><div className="pass-date"><strong>18</strong><div>SEPTEMBER<br/><b>FRI · 8:00 PM</b></div></div><div className="pass-details"><span>PARTY<b>4 guests</b></span><span>BOND<b>12.50 NIM</b></span></div><div className="pass-code"><QrCode size={124} weight="thin"/><small>CA–8F47–01</small></div></section>
    <div className="success-row"><CheckCircle weight="fill"/><span>Payment verified</span><code>{txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : 'Network confirmed'}</code></div>
    <button className="button button--app">View reservation pass <ArrowRight weight="bold"/></button><button className="secondary-action"><Copy/> Copy reservation link</button>
  </div>
}

function Privacy() {
  return <div className="legal"><Mark/><Link to="/"><ArrowLeft/> Back</Link><h1>Privacy, plainly.</h1><p>Pactum collects the minimum information needed to verify a reservation: wallet addresses, transaction hashes, reservation terms, and an append-only action history. It never receives wallet keys or seed phrases.</p><p>Public reservation links do not reveal guest identity, wallet history, internal notes, or staff information. Financial integrity records are retained; non-financial profile data can be requested for deletion.</p></div>
}

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return <Routes><Route path="/" element={<Landing/>}/><Route path="/p/:publicId" element={<MiniApp/>}/><Route path="/privacy" element={<Privacy/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>
}

export default App

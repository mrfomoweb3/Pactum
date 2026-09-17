import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import QrScanner from 'qr-scanner'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle, Copy, LockKey,
  QrCode, ShieldCheck, Sparkle, UserCircle, Wallet, X,
} from '@phosphor-icons/react'
import { connectNimiq, ensureNimiqReady, payBond, signRegistration, walletErrorMessage } from './nimiq'
import { createPassToken, createPaymentIntent, createRegistrationNonce, createRestaurantBond, getPublicBond, registerProfile, storedProfile, validatePass, verifyPayment, type PassToken, type PassValidation, type PaymentIntent, type Profile, type PublicBond, type Role } from './api'

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
      <button className="nav-cta" onClick={() => navigate('/start')}>Connect wallet <ArrowRight weight="bold" /></button>
    </header>

    <main>
      <section className="hero">
        <img className="hero__image" src="/pactum-dining-hero.png" alt="A table for four set for evening service" />
        <div className="hero__veil" />
        <div className="hero__content">
          <p className="eyebrow">A reservation bond, made gracious</p>
          <h1>A promise,<br/><em>kept.</em></h1>
          <p className="hero__sub">Secure a remarkable table with NIM. Keep the reservation—or pass it on, without a phone call.</p>
          <div className="hero__actions"><button className="button button--ivory" onClick={() => navigate('/start')}>Get started <ArrowRight weight="bold" /></button><button className="hero__link" onClick={() => navigate(`/p/${demo.publicId}`)}>View demo bond</button></div>
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
  const { publicId = demo.publicId } = useParams()
  const [step, setStep] = useState<AppStep>('review')
  const [accepted, setAccepted] = useState(false)
  const [wallet, setWallet] = useState('')
  const [error, setError] = useState('')
  const [txHash, setTxHash] = useState('')
  const [bond, setBond] = useState<PublicBond | null>(null)

  useEffect(() => {
    let active = true
    getPublicBond(publicId)
      .then((bond) => {
        if (!active) return
        setBond(bond)
        if (bond.status === 'SECURED' && bond.paymentTxHash) { setTxHash(bond.paymentTxHash); setStep('secured') }
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Reservation bond not found.') })
    return () => { active = false }
  }, [publicId])
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()

  const shortWallet = useMemo(() => wallet ? `${wallet.slice(0, 9)}…${wallet.slice(-5)}` : '', [wallet])

  async function connect() {
    setError(''); setStep('wallet')
    try {
      const account = await connectNimiq()
      const paymentIntent = await createPaymentIntent(publicId, account.address)
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
        const verified = await verifyPayment(publicId, intent.id, txHash)
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
        verified = await verifyPayment(publicId, intent.id, hash)
        if (verified) break
      }
      if (!verified) throw new Error('Payment detected and still confirming. Do not pay again; check its status shortly.')
      setStep('secured')
    } catch (caught) {
      setStep('confirm')
      setError(walletErrorMessage(caught, 'Nimiq Pay could not complete the payment. No reservation pass was issued.'))
    }
  }

  const restaurant = bond?.restaurant || demo.restaurant
  const amountNim = bond ? (bond.amountLuna / 100_000).toString() : demo.nim
  const reservationDate = bond?.reservationAt ? new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: bond.timezone || 'UTC' }).format(new Date(bond.reservationAt)) : demo.date
  const reservationTime = bond?.reservationAt ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: bond.timezone || 'UTC' }).format(new Date(bond.reservationAt)) : demo.time
  const partySize = bond?.partySize || demo.party
  return <div className="app-shell">
    <header className="app-header"><button aria-label="Back" onClick={() => navigate('/')}><ArrowLeft /></button><Mark/><button aria-label="Account" onClick={() => navigate('/start')}><UserCircle /></button></header>
    <main className="bond-screen">
      {step !== 'secured' ? <>
        <div className="bond-heading"><p>CASA AUREA · RESERVATION BOND</p><h1>Your table is being held.</h1><span>Review the details before you make your promise.</span></div>
        <section className="reservation-card">
          <div className="reservation-card__brand"><span>{restaurant.slice(0, 2).toUpperCase()}</span><div><h2>{restaurant}</h2><p>Verified restaurant wallet</p></div><ShieldCheck weight="fill"/></div>
          <div className="date-lockup"><span>DATE</span><strong>{bond?.reservationAt ? new Date(bond.reservationAt).getUTCDate() : '18'}</strong><div><b>{reservationDate}</b><p>{reservationTime} · {partySize} guests</p></div></div>
          <div className="amount-row"><span>Reservation bond</span><strong>{amountNim} <small>NIM</small></strong></div>
          <button className="policy-row" onClick={() => setSheetOpen(true)}><span><LockKey/> Cancellation policy</span><ArrowRight/></button>
        </section>
        <div className="notice"><ShieldCheck/><p>You are sending <b>{amountNim} NIM directly to {restaurant}</b> as a reservation bond. Pactum does not hold these funds.</p></div>
        {error && <div className="error-message" role="alert">{error}</div>}
        {step === 'review' && <label className="terms"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/><span><Check weight="bold"/></span><p>I understand the cancellation policy and agree to the reservation terms.</p></label>}
        {step === 'confirm' && <div className="wallet-chip"><Wallet weight="fill"/><span>Paying with <b>{shortWallet}</b></span><button onClick={() => {setWallet(''); setStep('review')}}>Change</button></div>}
        <div className="app-action">
          {step === 'review' && <button disabled={!accepted} className="button button--app" onClick={connect}>Secure this table <ArrowRight weight="bold"/></button>}
          {step === 'wallet' && <button disabled className="button button--app">Waiting for Nimiq Pay…</button>}
          {step === 'confirm' && <button className="button button--app" onClick={pay}>{txHash ? 'Check payment status' : `Confirm ${amountNim} NIM`} <ArrowRight weight="bold"/></button>}
          {step === 'pending' && <button disabled className="button button--app">Confirming payment…</button>}
          <p><LockKey weight="fill"/> Confirmed securely in Nimiq Pay</p>
        </div>
      </> : <SecuredPass txHash={txHash} publicId={publicId} bond={bond}/>}
    </main>
    {sheetOpen && <div className="sheet-backdrop" onClick={() => setSheetOpen(false)}><aside className="sheet" onClick={e => e.stopPropagation()}><button className="sheet__close" onClick={() => setSheetOpen(false)}><X/></button><p>Cancellation policy</p><h2>A clear promise,<br/>in plain language.</h2><p>{bond?.policyText || demo.policy}</p><div><CheckCircle weight="fill"/><span>Funds return to the original payer when a full refund is approved.</span></div><button className="button button--app" onClick={() => setSheetOpen(false)}>I understand</button></aside></div>}
  </div>
}

function SecuredPass({ txHash, publicId, bond }: { txHash: string; publicId: string; bond: PublicBond | null }) {
  const [pass, setPass] = useState<PassToken | null>(null)
  const [error, setError] = useState('')
  const profile = storedProfile()
  async function revealPass() {
    setError('')
    try { setPass(await createPassToken(publicId)) } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create the pass.') }
  }
  const scanUrl = pass ? `${window.location.origin}/staff/scan?token=${pass.token}` : ''
  return <div className="secured">
    <div className="secured__seal"><Check weight="bold"/></div><p>RESERVATION SECURED</p><h1>Your table awaits.</h1><span>The restaurant has received your bond.</span>
    <section className="pass-card"><div className="pass-card__top"><span>PACTUM / 01</span><b>{bond?.restaurant || demo.restaurant}</b></div><div className="pass-date"><strong>{bond?.reservationAt ? new Date(bond.reservationAt).getUTCDate() : '18'}</strong><div>RESERVATION<br/><b>{bond?.reservationAt ? new Date(bond.reservationAt).toLocaleString() : 'FRI · 8:00 PM'}</b></div></div><div className="pass-details"><span>PARTY<b>{bond?.partySize || demo.party} guests</b></span><span>BOND<b>{bond ? bond.amountLuna / 100_000 : demo.nim} NIM</b></span></div><div className="pass-code">{pass ? <QRCodeSVG value={scanUrl} size={164} level="M" marginSize={2}/> : <QrCode size={124} weight="thin"/>}<small>{pass ? pass.shortCode : 'WALLET-BOUND PASS'}</small>{pass && <em>Refreshes in 5 minutes for your safety</em>}</div></section>
    <div className="success-row"><CheckCircle weight="fill"/><span>Payment verified</span><code>{txHash ? `${txHash.slice(0, 10)}…${txHash.slice(-6)}` : 'Network confirmed'}</code></div>
    {error && <div className="error-message" role="alert">{error}</div>}
    {profile?.role === 'GUEST' ? <button className="button button--app" onClick={revealPass}>{pass ? 'Refresh secure QR' : 'Reveal secure QR'} <ArrowRight weight="bold"/></button> : <Link className="button button--app" to="/start?role=guest&returnTo=pass">Create guest profile to reveal QR <ArrowRight weight="bold"/></Link>}<button className="secondary-action" onClick={() => navigator.clipboard.writeText(window.location.href)}><Copy/> Copy reservation link</button>
  </div>
}

function Start() {
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const requestedRole: Role | null = search.get('role') === 'guest' ? 'GUEST' : search.get('role') === 'restaurant' ? 'RESTAURANT' : null
  const [role, setRole] = useState<Role | null>(requestedRole)
  const [wallet, setWallet] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const existing = storedProfile()

  async function connect() {
    setBusy(true); setError('')
    try { setWallet((await connectNimiq()).address) } catch (caught) { setError(walletErrorMessage(caught, 'Open Pactum inside Nimiq Pay to connect.')) } finally { setBusy(false) }
  }
  async function register() {
    if (!role) return
    setBusy(true); setError('')
    try {
      const nonce = await createRegistrationNonce(wallet, role)
      const signed = await signRegistration(nonce.message)
      const result = await registerProfile({ nonceId: nonce.id, publicKey: signed.publicKey, signature: signed.signature, displayName: name, restaurantSlug: role === 'RESTAURANT' ? slug : undefined, timezone: role === 'RESTAURANT' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined })
      navigate(result.profile.role === 'RESTAURANT' ? '/restaurant' : search.get('returnTo') === 'pass' ? `/p/${demo.publicId}` : '/guest')
    } catch (caught) { setError(walletErrorMessage(caught, 'Registration could not be completed.')) } finally { setBusy(false) }
  }

  if (existing) return <ProfileHome profile={existing}/>
  return <div className="onboarding"><header><Mark/><Link to="/"><X/></Link></header><main>
    {!role ? <><p className="eyebrow">Begin with your wallet</p><h1>How will you use Pactum?</h1><p className="onboarding__lede">One wallet, one clear role. You can create a venue profile or hold reservation passes.</p><div className="role-grid"><button onClick={() => setRole('RESTAURANT')}><span>01</span><h2>I run a restaurant</h2><p>Publish reservation bonds, receive NIM directly, and welcome verified guests.</p><ArrowRight/></button><button onClick={() => setRole('GUEST')}><span>02</span><h2>I’m a guest</h2><p>Secure a table, keep your QR pass, and transfer it when plans change.</p><ArrowRight/></button></div></> :
    <><button className="back-link" onClick={() => { setRole(null); setWallet('') }}><ArrowLeft/> Change role</button><p className="eyebrow">{role === 'RESTAURANT' ? 'Restaurant onboarding' : 'Guest onboarding'}</p><h1>{wallet ? 'Create your profile.' : 'Connect your wallet.'}</h1><p className="onboarding__lede">{wallet ? 'You will sign a readable registration message. No payment is required.' : 'Your Nimiq address becomes your secure Pactum identity.'}</p>
      {!wallet ? <button className="button button--app onboarding__cta" disabled={busy} onClick={connect}><Wallet weight="fill"/>{busy ? 'Waiting for Nimiq Pay…' : 'Connect Nimiq wallet'}</button> : <div className="profile-form"><div className="wallet-chip"><Wallet weight="fill"/><span>{wallet.slice(0, 14)}…{wallet.slice(-6)}</span><b>Connected</b></div><label>{role === 'RESTAURANT' ? 'Restaurant name' : 'Your display name'}<input value={name} maxLength={80} onChange={e => { setName(e.target.value); if (role === 'RESTAURANT') setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) }} placeholder={role === 'RESTAURANT' ? 'Casa Aurea' : 'Amara'}/></label>{role === 'RESTAURANT' && <label>Public restaurant URL<input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}/><small>pactum.app/r/{slug || 'your-restaurant'}</small></label>}<button className="button button--app" disabled={busy || name.trim().length < 2 || (role === 'RESTAURANT' && !slug)} onClick={register}>{busy ? 'Confirm in Nimiq Pay…' : 'Sign and create profile'} <ArrowRight/></button></div>}
    </>}{error && <div className="error-message" role="alert">{error}</div>}
  </main></div>
}

function ProfileHome({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  return <div className="onboarding"><header><Mark/><Link to="/"><X/></Link></header><main><p className="eyebrow">Wallet connected</p><h1>Welcome back, {profile.displayName}.</h1><div className="profile-summary"><span>{profile.role === 'RESTAURANT' ? 'Restaurant operator' : 'Guest holder'}</span><code>{profile.walletAddress}</code></div><button className="button button--app" onClick={() => navigate(profile.role === 'RESTAURANT' ? '/restaurant' : '/guest')}>Continue <ArrowRight/></button></main></div>
}

function GuestHome() {
  const profile = storedProfile()
  if (!profile || profile.role !== 'GUEST') return <Navigate to="/start?role=guest" replace/>
  return <div className="workspace"><header><Mark/><span>{profile.displayName}</span></header><main><p className="eyebrow">Guest wallet</p><h1>Your evenings,<br/>kept together.</h1><section className="workspace-card"><span>ACTIVE RESERVATION</span><h2>Casa Aurea</h2><p>Friday, 18 September · 8:00 PM · 4 guests</p><Link className="button button--app" to={`/p/${demo.publicId}`}>Open reservation pass <ArrowRight/></Link></section></main></div>
}

function RestaurantHome() {
  const profile = storedProfile()
  if (!profile || profile.role !== 'RESTAURANT') return <Navigate to="/start?role=restaurant" replace/>
  return <div className="workspace"><header><Mark/><span>{profile.displayName}</span></header><main><p className="eyebrow">Restaurant workspace</p><h1>Good evening,<br/>{profile.displayName}.</h1><div className="workspace-actions"><Link className="button button--app" to="/restaurant/new">Create reservation bond <ArrowRight/></Link><Link className="button workspace__secondary" to="/staff/scan"><QrCode/> Validate a guest pass</Link></div><section className="workspace-card"><span>UPCOMING</span><h2>Casa Aurea · Table for four</h2><p>Secured · {demo.nim} NIM bond</p></section></main></div>
}

function StaffScan() {
  const [search] = useSearchParams()
  const [code, setCode] = useState('')
  const [result, setResult] = useState<PassValidation | null>(null)
  const [error, setError] = useState('')
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'active' | 'denied'>('idle')
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const validatingRef = useRef(false)

  async function check(input: { token?: string; code?: string }) {
    if (validatingRef.current) return
    validatingRef.current = true; setError(''); setResult(null)
    try {
      const validation = await validatePass(input)
      setResult(validation)
      scannerRef.current?.stop()
      setCameraState('idle')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Pass could not be validated.')
    } finally { validatingRef.current = false }
  }

  async function handleScanData(data: string) {
    try {
      const scanned = new URL(data, window.location.origin)
      const token = scanned.searchParams.get('token')
      if (!token || !/^[0-9a-f]{64}$/i.test(token)) throw new Error('This is not a valid Pactum reservation QR code.')
      await check({ token })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This QR code is not a Pactum pass.')
    }
  }

  async function startCamera() {
    if (!videoRef.current) return
    setError(''); setResult(null); setCameraState('starting')
    scannerRef.current?.destroy()
    const scanner = new QrScanner(videoRef.current, (scan) => { void handleScanData(scan.data) }, {
      preferredCamera: 'environment',
      maxScansPerSecond: 8,
      highlightScanRegion: true,
      highlightCodeOutline: true,
      returnDetailedScanResult: true,
    })
    scannerRef.current = scanner
    try { await scanner.start(); setCameraState('active') } catch (caught) {
      scanner.destroy(); scannerRef.current = null; setCameraState('denied')
      setError(walletErrorMessage(caught, 'Camera access was unavailable. Allow camera permission or use the manual pass code.'))
    }
  }

  function stopCamera() { scannerRef.current?.stop(); setCameraState('idle') }
  useEffect(() => {
    const scanner = scannerRef.current
    return () => scanner?.destroy()
  }, [])
  useEffect(() => { const token = search.get('token'); if (token) void check({ token }) }, [search])

  return <div className="app-shell"><header className="app-header"><Link to="/restaurant"><ArrowLeft/></Link><Mark/><span/></header><main className="scan-screen"><p className="eyebrow">Staff validation</p><h1>Validate a pass.</h1><div className={`scanner-frame scanner-frame--${cameraState}`}><video ref={videoRef} muted playsInline/><div className="scanner-guide"><span/><span/><span/><span/></div>{cameraState !== 'active' && <div className="scanner-placeholder"><QrCode size={62}/><p>Point the rear camera at the guest’s live Pactum QR.</p><button className="button button--app" disabled={cameraState === 'starting'} onClick={() => void startCamera()}>{cameraState === 'starting' ? 'Opening camera…' : cameraState === 'denied' ? 'Retry camera' : 'Start QR scanner'}</button></div>}{cameraState === 'active' && <button className="scanner-stop" onClick={stopCamera}>Stop camera</button>}</div><div className="manual-divider"><span>or use the code</span></div><form onSubmit={e => { e.preventDefault(); void check({ code }) }}><label>Manual pass code<input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="A1B2C3D4E5" maxLength={10}/></label><button className="button button--app" disabled={code.length !== 10}>Validate pass</button></form>{result && <div className="scan-result"><CheckCircle weight="fill"/><h2>Valid current pass</h2><p>{result.restaurant} · {(result.amountLuna / 100000).toFixed(2)} NIM</p><small>Holder {result.holder}</small></div>}{error && <div className="error-message">{error}</div>}</main></div>
}

function Privacy() {
  return <div className="legal"><Mark/><Link to="/"><ArrowLeft/> Back</Link><h1>Privacy, plainly.</h1><p>Pactum collects the minimum information needed to verify a reservation: wallet addresses, transaction hashes, reservation terms, and an append-only action history. It never receives wallet keys or seed phrases.</p><p>Public reservation links do not reveal guest identity, wallet history, internal notes, or staff information. Financial integrity records are retained; non-financial profile data can be requested for deletion.</p></div>
}

function NewBond() {
  const profile = storedProfile()
  const [reservationAt, setReservationAt] = useState('')
  const [deadline, setDeadline] = useState('')
  const [partySize, setPartySize] = useState('4')
  const [amount, setAmount] = useState('0.01')
  const [policy, setPolicy] = useState(demo.policy)
  const [reference, setReference] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ publicId: string } | null>(null)
  if (!profile || profile.role !== 'RESTAURANT') return <Navigate to="/start?role=restaurant" replace/>
  const restaurantProfile = profile
  function amountLuna(): number {
    if (!/^\d+(?:\.\d{1,5})?$/.test(amount)) return 0
    const [whole, fraction = ''] = amount.split('.')
    return Number(whole) * 100_000 + Number(fraction.padEnd(5, '0'))
  }
  function review() {
    setError('')
    if (!reservationAt || new Date(reservationAt).getTime() <= Date.now()) return setError('Choose a future reservation time.')
    if (!deadline || new Date(deadline) >= new Date(reservationAt)) return setError('Cancellation deadline must be before the reservation.')
    if (Number(partySize) < 1 || Number(partySize) > 20) return setError('Party size must be between 1 and 20.')
    if (!amountLuna()) return setError('Enter a valid NIM amount with no more than five decimal places.')
    if (policy.trim().length < 10) return setError('Add a clear cancellation policy.')
    setReviewing(true)
  }
  async function create() {
    setBusy(true); setError('')
    try {
      const result = await createRestaurantBond(restaurantProfile.id, { reservationAt: new Date(reservationAt).toISOString(), cancellationDeadline: new Date(deadline).toISOString(), partySize: Number(partySize), amountLuna: amountLuna(), policyText: policy, externalReference: reference || undefined })
      setCreated(result)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'The reservation bond could not be created.') } finally { setBusy(false) }
  }
  const link = created ? `${window.location.origin}/p/${created.publicId}` : ''
  return <div className="workspace"><header><Mark/><Link to="/restaurant"><X/></Link></header><main><p className="eyebrow">New reservation bond</p><h1>{created ? 'Ready to share.' : reviewing ? 'Review the promise.' : 'Set the promise.'}</h1>
    {created ? <section className="created-bond"><CheckCircle weight="fill"/><h2>Reservation bond created</h2><p>The terms are now published. Share this link with the guest who will secure the table.</p><code>{link}</code><div><button className="button button--app" onClick={() => navigator.clipboard.writeText(link)}><Copy/> Copy guest link</button><Link className="button workspace__secondary" to={`/p/${created.publicId}`}>Open public bond <ArrowRight/></Link></div></section> : reviewing ? <section className="bond-review"><div><span>RESTAURANT</span><b>{profile.displayName}</b></div><div><span>RESERVATION</span><b>{new Date(reservationAt).toLocaleString()} · {partySize} guests</b></div><div><span>BOND</span><b>{amount} NIM</b></div><div><span>CANCEL BY</span><b>{new Date(deadline).toLocaleString()}</b></div><div><span>POLICY</span><p>{policy}</p></div><div className="review-warning"><ShieldCheck/><p>NIM will go directly to <b>{profile.walletAddress}</b>. Published payment terms cannot be silently changed.</p></div><div className="review-actions"><button className="button workspace__secondary" onClick={() => setReviewing(false)}>Edit terms</button><button className="button button--app" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Publish reservation bond'} <ArrowRight/></button></div></section> : <div className="profile-form"><label>Reservation date and time<input type="datetime-local" value={reservationAt} onChange={e => setReservationAt(e.target.value)}/></label><label>Cancellation deadline<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)}/></label><label>Party size<input type="number" min="1" max="20" value={partySize} onChange={e => setPartySize(e.target.value)}/></label><label>Bond amount in NIM<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>External reference <small>Optional — for your own records</small><input value={reference} maxLength={120} onChange={e => setReference(e.target.value)} placeholder="RES-2048"/></label><label>Cancellation policy<textarea maxLength={600} value={policy} onChange={e => setPolicy(e.target.value)}/><small>{policy.length}/600 characters</small></label><button className="button button--app" type="button" onClick={review}>Review reservation bond <ArrowRight/></button></div>}{error && <div className="error-message" role="alert">{error}</div>}</main></div>
}

function App() {
  useEffect(() => { window.scrollTo(0, 0) }, [])
  return <Routes><Route path="/" element={<Landing/>}/><Route path="/start" element={<Start/>}/><Route path="/guest" element={<GuestHome/>}/><Route path="/restaurant" element={<RestaurantHome/>}/><Route path="/restaurant/new" element={<NewBond/>}/><Route path="/staff/scan" element={<StaffScan/>}/><Route path="/p/:publicId" element={<MiniApp/>}/><Route path="/privacy" element={<Privacy/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>
}

export default App

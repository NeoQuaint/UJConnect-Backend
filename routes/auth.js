import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const Login = () => {
  const navigate = useNavigate();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(true);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [step, setStep] = useState(1);

  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    preferred_name: '',
    student_number: '',
    email: '',
    department: '',
    course: '',
    password: '',
    confirmPassword: ''
  });

  const departments = [
    'Accountancy', 'Applied Information Systems', 'Business Management',
    'Economics and Econometrics', 'Finance & Investment Management',
    'Information & Knowledge Management', 'Public Management & Governance',
    'Hospitality', 'Commercial Accountancy', 'Industrial Psychology',
    'Marketing', 'Transport & Supply Chain Management', 'Tourism'
  ];

  // Check auth on load - auto-login if verified
  useEffect(() => {
    const token = localStorage.getItem('ujconnect_token');
    if (token) {
      const user = JSON.parse(localStorage.getItem('ujconnect_user') || '{}');
      if (user.verified) {
        navigate('/dashboard', { replace: true });
        setCheckingAuth(false);
        return;
      } else {
        // Not verified - check backend
        const checkVerified = async () => {
          try {
            const { data } = await axios.get(`${API_URL}/api/users/${user.id}`);
            if (data.verified) {
              localStorage.setItem('ujconnect_user', JSON.stringify(data));
              navigate('/dashboard', { replace: true });
            } else {
              setShowVerificationPrompt(true);
              setVerificationEmail(user.email);
            }
          } catch (err) {
            // Stay on login page
          }
          setCheckingAuth(false);
        };
        checkVerified();
        return;
      }
    }
    setCheckingAuth(false);
  }, [navigate]);

  // Auto-poll verification status every 3 seconds
  useEffect(() => {
    if (!showVerificationPrompt || !verificationEmail) return;

    const checkInterval = setInterval(async () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('ujconnect_user') || '{}');
        if (!storedUser.id) return;
        const { data } = await axios.get(`${API_URL}/api/users/${storedUser.id}`);
        if (data.verified) {
          localStorage.setItem('ujconnect_user', JSON.stringify(data));
          window.location.href = '/dashboard';
        }
      } catch (err) {
        // silent - keep polling
      }
    }, 3000);

    return () => clearInterval(checkInterval);
  }, [showVerificationPrompt, verificationEmail]);

  const handleGetStarted = () => {
    if (termsAccepted) {
      const token = localStorage.getItem('ujconnect_token');
      if (token) {
        const user = JSON.parse(localStorage.getItem('ujconnect_user') || '{}');
        if (user.verified) {
          navigate('/dashboard');
        } else {
          setShowVerificationPrompt(true);
          setVerificationEmail(user.email);
        }
      } else {
        setShowAuth(true);
        setIsSignUp(true);
        setStep(1);
      }
    }
  };

  const handleAuthChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setAuthError('');
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');

    if (formData.password !== formData.confirmPassword) {
      setAuthError('Passwords do not match');
      setIsAuthLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setAuthError('Password must be at least 8 characters');
      setIsAuthLoading(false);
      return;
    }

    try {
      const { data } = await axios.post(`${API_URL}/api/auth/register`, {
        full_name: formData.full_name,
        preferred_name: formData.preferred_name,
        student_number: formData.student_number,
        email: formData.email,
        department: formData.department,
        course: formData.course,
        password: formData.password
      });

      localStorage.setItem('ujconnect_user', JSON.stringify(data.user));
      localStorage.setItem('ujconnect_token', data.token);
      setShowAuth(false);
      setShowVerificationPrompt(true);
      setVerificationEmail(data.user.email);
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setIsAuthLoading(true);
    setAuthError('');

    try {
      const { data } = await axios.post(`${API_URL}/api/auth/login`, {
        email: formData.email,
        password: formData.password
      });

      if (!data.user.verified) {
        localStorage.setItem('ujconnect_user', JSON.stringify(data.user));
        localStorage.setItem('ujconnect_token', data.token);
        setShowAuth(false);
        setShowVerificationPrompt(true);
        setVerificationEmail(data.user.email);
        setIsAuthLoading(false);
        return;
      }

      localStorage.setItem('ujconnect_user', JSON.stringify(data.user));
      localStorage.setItem('ujconnect_token', data.token);
      setShowAuth(false);
      window.location.href = '/dashboard';
    } catch (err) {
      setAuthError(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthSubmit = (e) => {
    if (isSignUp) {
      handleSignUp(e);
    } else {
      handleSignIn(e);
    }
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setAuthError('');
    setStep(1);
    setFormData(prev => ({
      ...prev,
      password: '',
      confirmPassword: ''
    }));
  };

  if (checkingAuth) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      position: 'relative'
    }}>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'radial-gradient(circle at 20% 30%, rgba(255,107,0,0.03) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,107,0,0.03) 0%, transparent 40%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      <div style={{
        maxWidth: '540px',
        width: '100%',
        textAlign: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '50px', display: 'flex', justifyContent: 'center' }}>
          <img
            src="/UJCONNECT.png"
            alt="UJ Connect"
            style={{
              height: '65px',
              width: 'auto',
              display: 'block'
            }}
          />
        </div>

        {/* Tagline */}
        <p style={{
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          fontSize: '28px',
          fontWeight: 600,
          lineHeight: 1.4,
          marginBottom: '52px',
          letterSpacing: '-0.5px',
          color: '#333',
          maxWidth: '420px',
          marginLeft: 'auto',
          marginRight: 'auto'
        }}>
          Connect. Collaborate. Create.
        </p>

        {/* Get started button */}
        <button
          onClick={handleGetStarted}
          disabled={!termsAccepted}
          style={{
            background: termsAccepted
              ? 'linear-gradient(135deg, #FF6B00 0%, #FF8C42 100%)'
              : 'linear-gradient(135deg, #b3b3b3 0%, #999999 100%)',
            color: 'white',
            border: 'none',
            padding: '18px 56px',
            fontFamily: 'inherit',
            fontSize: '20px',
            fontWeight: 600,
            borderRadius: '50px',
            cursor: termsAccepted ? 'pointer' : 'not-allowed',
            transition: 'all 0.3s ease',
            minWidth: '220px',
            opacity: termsAccepted ? 1 : 0.7,
            pointerEvents: termsAccepted ? 'auto' : 'none',
            boxShadow: termsAccepted ? '0 8px 30px rgba(255, 107, 0, 0.25)' : 'none'
          }}
        >
          Get started
        </button>

        <div style={{ marginTop: '22px' }}>
          <label style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '16px',
            color: '#888',
            userSelect: 'none'
          }}>
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#FF6B00', margin: 0 }}
            />
            <span>
              I agree to the{' '}
              <a href="/terms" style={{ color: '#FF6B00', textDecoration: 'none', fontWeight: 500 }}>Terms</a>
              {' '}&{' '}
              <a href="/privacy" style={{ color: '#FF6B00', textDecoration: 'none', fontWeight: 500 }}>Privacy Policy</a>
            </span>
          </label>
        </div>

        <div style={{ marginTop: '16px' }}>
          <button
            onClick={() => { setShowAuth(true); setIsSignUp(false); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#1a1a1a',
              fontSize: '16px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
              textDecorationThickness: '1px'
            }}
          >
            Already have an account? Sign In
          </button>
        </div>

        <p style={{
          marginTop: '56px',
          color: '#ccc',
          fontSize: '15px',
          fontFamily: 'inherit',
          letterSpacing: '0.5px'
        }}>
          UJ Connect 2026
        </p>
      </div>

      {/* VERIFICATION PROMPT */}
      {showVerificationPrompt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'white',
          zIndex: 3000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: '#FFF7ED',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '24px'
            }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#1a1a1a', marginBottom: '12px' }}>
              Check your email
            </h2>
            <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.6, marginBottom: '8px' }}>
              We sent a verification link to
            </p>
            <p style={{ fontSize: '15px', fontWeight: 600, color: '#FF6B00', marginBottom: '24px' }}>
              {verificationEmail}
            </p>
            <p style={{ fontSize: '13px', color: '#888', marginBottom: '8px', lineHeight: 1.5 }}>
              Click the link in your email to verify. This page will auto-refresh once verified.
            </p>
            <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: 600, marginBottom: '32px' }}>
              Check your spam/junk folder if you don't see it!
            </p>
            <div style={{
              width: '40px',
              height: '40px',
              margin: '0 auto 16px',
              border: '3px solid #eee',
              borderTopColor: '#FF6B00',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p style={{ fontSize: '12px', color: '#aaa', marginBottom: '16px' }}>
              Waiting for verification...
            </p>
            <p style={{ fontSize: '12px', color: '#aaa' }}>
              Didn't get the email?{' '}
              <span
                onClick={async () => {
                  try {
                    await axios.post(`${API_URL}/api/auth/resend-verification`, { email: verificationEmail });
                    alert('Verification email resent! Check your inbox and spam folder.');
                  } catch (err) {
                    alert('Failed to resend. Please try again later.');
                  }
                }}
                style={{ color: '#FF6B00', cursor: 'pointer', textDecoration: 'underline' }}
              >
                resend
              </span>
            </p>
          </div>
        </div>
      )}

      {/* AUTH MODAL */}
      {showAuth && (
        <div
          onClick={() => setShowAuth(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '20px',
              padding: '32px 28px 24px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowAuth(false)}
              style={{
                position: 'absolute',
                top: '14px',
                right: '18px',
                background: 'none',
                border: 'none',
                fontSize: '28px',
                cursor: 'pointer',
                color: '#999',
                lineHeight: 1
              }}
            >×</button>

            <h2 style={{ fontSize: '26px', fontWeight: 700, color: '#1a1a1a', marginBottom: '4px', textAlign: 'center' }}>
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h2>

            {isSignUp && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', margin: '20px 0 28px' }}>
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    style={{
                      width: s === step ? '28px' : '10px',
                      height: '10px',
                      borderRadius: '5px',
                      background: s <= step ? '#FF6B00' : '#e2e8f0',
                      transition: 'all 0.3s ease'
                    }}
                  />
                ))}
              </div>
            )}

            {!isSignUp && (
              <p style={{ fontSize: '15px', color: '#888', textAlign: 'center', marginBottom: '28px', marginTop: '10px' }}>
                Sign in to your account
              </p>
            )}

            {authError && (
              <div style={{ background: '#fff5f5', border: '1px solid #feb2b2', color: '#c53030', padding: '12px 16px', borderRadius: '10px', fontSize: '15px', marginBottom: '20px', textAlign: 'center' }}>
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {!isSignUp && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Email Address</label>
                    <input type="email" name="email" value={formData.email} onChange={handleAuthChange} required placeholder="you@student.uj.ac.za" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Password</label>
                    <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleAuthChange} required placeholder="Your password" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              {isSignUp && step === 1 && (
                <>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Personal Information</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Full Name</label>
                    <input type="text" name="full_name" value={formData.full_name} onChange={handleAuthChange} required placeholder="Neo Mashigo" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Preferred Name <span style={{ color: '#aaa', fontWeight: 400, fontSize: '13px' }}>(optional)</span></label>
                    <input type="text" name="preferred_name" value={formData.preferred_name} onChange={handleAuthChange} placeholder="What should we call you?" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              {isSignUp && step === 2 && (
                <>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Student Details</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Student Number</label>
                    <input type="text" name="student_number" value={formData.student_number} onChange={handleAuthChange} required placeholder="222067545" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Department</label>
                    <select name="department" value={formData.department} onChange={handleAuthChange} required style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit', background: 'white', cursor: 'pointer' }}>
                      <option value="">Select your department</option>
                      {departments.map(dept => (<option key={dept} value={dept}>{dept}</option>))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Course <span style={{ color: '#aaa', fontWeight: 400, fontSize: '13px' }}>(optional)</span></label>
                    <input type="text" name="course" value={formData.course} onChange={handleAuthChange} placeholder="e.g. BCom Information Management" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Student Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleAuthChange} required placeholder="222067545@student.uj.ac.za" style={{ width: '100%', padding: '14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </>
              )}

              {isSignUp && step === 3 && (
                <>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: '#aaa', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Security</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Password</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showPassword ? 'text' : 'password'} name="password" value={formData.password} onChange={handleAuthChange} required placeholder="Min. 8 characters" style={{ width: '100%', padding: '14px 48px 14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '8px 10px' }}>{showPassword ? '🙈' : '👁️'}</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
                    <label style={{ fontSize: '14px', fontWeight: 600, color: '#4a5568' }}>Confirm Password</label>
                    <div style={{ position: 'relative' }}>
                      <input type={showConfirmPassword ? 'text' : 'password'} name="confirmPassword" value={formData.confirmPassword} onChange={handleAuthChange} required placeholder="Re-enter your password" style={{ width: '100%', padding: '14px 48px 14px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', fontSize: '16px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '8px 10px' }}>{showConfirmPassword ? '🙈' : '👁️'}</button>
                    </div>
                  </div>
                </>
              )}

              {isSignUp ? (
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  {step > 1 && (
                    <button type="button" onClick={prevStep} style={{ flex: 1, padding: '15px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Back</button>
                  )}
                  {step < 3 ? (
                    <button type="button" onClick={nextStep} style={{ flex: 1, padding: '15px', background: 'linear-gradient(135deg, #FF6B00, #FF8C42)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 6px 18px rgba(255, 107, 0, 0.25)' }}>Next</button>
                  ) : (
                    <button type="submit" disabled={isAuthLoading} style={{ flex: 1, padding: '15px', background: 'linear-gradient(135deg, #FF6B00, #FF8C42)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: isAuthLoading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: isAuthLoading ? 0.7 : 1, boxShadow: '0 6px 18px rgba(255, 107, 0, 0.25)' }}>{isAuthLoading ? 'Creating...' : 'Create Account'}</button>
                  )}
                </div>
              ) : (
                <button type="submit" disabled={isAuthLoading} style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #FF6B00, #FF8C42)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: isAuthLoading ? 'not-allowed' : 'pointer', marginTop: '6px', fontFamily: 'inherit', opacity: isAuthLoading ? 0.7 : 1, boxShadow: '0 6px 18px rgba(255, 107, 0, 0.25)' }}>{isAuthLoading ? 'Signing in...' : 'Sign In'}</button>
              )}
            </form>

            <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
              <button onClick={toggleAuthMode} style={{ background: 'none', border: 'none', color: '#1a1a1a', fontSize: '15px', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '3px', fontFamily: 'inherit' }}>
                {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login;
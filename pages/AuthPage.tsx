
import React, { useState, FC, useRef, useEffect, useMemo, useCallback } from 'react';
import { Card, Spinner } from '../components/ui';
import { User, ApiService } from '../types';
import { EmailIcon, LockClosedIcon, UserIcon, BuildingOfficeIcon, CheckIcon, CloseIcon, LoadingSpinnerIcon, EyeIcon, EyeSlashIcon, ArrowLeftIcon } from '../components/icons';

type AuthPageProps = {
    api: ApiService;
    onLoginSuccess: (user: User) => void;
    onLoginStart?: () => void;
    showToast: (message: string, type: 'success' | 'error') => void;
};

const PasswordRequirement: FC<{ text: string, met: boolean }> = ({ text, met }) => (
    <li className={`flex items-center gap-2 text-sm transition-colors ${met ? 'text-green-600' : 'text-slate-500'}`}>
        {met ? <CheckIcon className="w-4 h-4" /> : <CloseIcon className="w-4 h-4" />}
        <span>{text}</span>
    </li>
);

const PasswordStrengthMeter: FC<{ strength: number }> = ({ strength }) => {
    const strengthLevels = [
        { width: '0%', color: '' },
        { width: '25%', color: 'bg-red-500' },
        { width: '50%', color: 'bg-orange-500' },
        { width: '75%', color: 'bg-yellow-500' },
        { width: '100%', color: 'bg-green-500' },
    ];
    return (
        <div className="w-full bg-slate-200 dark:bg-slate-600 rounded-full h-1.5">
            <div
                className={`h-1.5 rounded-full transition-all duration-300 ${strengthLevels[strength].color}`}
                style={{ width: strengthLevels[strength].width }}
            />
        </div>
    );
};


const AuthPage: FC<AuthPageProps> = ({ api, onLoginSuccess, onLoginStart, showToast }) => {
    const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot-password'>('signin');
    const [isLoading, setIsLoading] = useState(false);
    const [isSlowConnection, setIsSlowConnection] = useState(false);
    const [isChecking, setIsChecking] = useState<Record<string, boolean>>({});
    const [showResendLink, setShowResendLink] = useState(false);
    
    // New state to show SQL fix directly in UI
    const [dbSetupScript, setDbSetupScript] = useState<string | null>(null);

    const [companyExists, setCompanyExists] = useState<boolean | null>(null);
    // Form fields & validation state
    const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '', companyName: '' });
    const [errors, setErrors] = useState<Record<string, string | null>>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [passwordStrength, setPasswordStrength] = useState(0);
    const [passwordVisibility, setPasswordVisibility] = useState({ password: false, confirmPassword: false });

    const emailInputRef = useRef<HTMLInputElement>(null);
    const companyInputRef = useRef<HTMLInputElement>(null);
    const forgotEmailInputRef = useRef<HTMLInputElement>(null);

    // Optimized: Only check connection once on mount, removed polling interval
    useEffect(() => {
        api.checkConnection().catch(() => {});
    }, [api]);

    const passwordCriteria = useMemo(() => {
        const { password } = form;
        return {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            number: /[0-9]/.test(password),
            specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
        };
    }, [form.password]);

    const togglePasswordVisibility = (field: 'password' | 'confirmPassword') => {
        setPasswordVisibility(prev => ({ ...prev, [field]: !prev[field] }));
    };

    useEffect(() => {
        if (authMode === 'signin') {
            setTimeout(() => emailInputRef.current?.focus(), 100);
        } else if (authMode === 'signup') {
            setTimeout(() => companyInputRef.current?.focus(), 100);
        } else if (authMode === 'forgot-password') {
            setTimeout(() => forgotEmailInputRef.current?.focus(), 100);
        }
        // Reset state on mode change
        setForm({ fullName: '', email: '', password: '', confirmPassword: '', companyName: '' });
        setErrors({});
        setTouched({});
        setPasswordStrength(0);
        setCompanyExists(null);
        setPasswordVisibility({ password: false, confirmPassword: false });
        setShowResendLink(false);
        setIsSlowConnection(false);
        setDbSetupScript(null); // Clear any error scripts
    }, [authMode]);

    const validateField = useCallback(async (name: string, value: string) => {
        let error: string | null = null;
        switch (name) {
            case 'companyName':
                if (!value) error = 'Company name is required.';
                else if (value.length < 3) error = 'Must be at least 3 characters.';
                break;
            case 'fullName':
                if (!value) error = 'Your name is required.';
                break;
            case 'email':
                if (!value) error = 'Email is required.';
                else if (!/\S+@\S+\.\S+/.test(value)) error = 'Email is invalid.';
                else if (authMode === 'signup') {
                    setIsChecking(prev => ({ ...prev, email: true }));
                    const exists = await api.checkEmailExists(value);
                    if (exists) error = 'This email is already in use.';
                    setIsChecking(prev => ({ ...prev, email: false }));
                }
                break;
            case 'password':
                const criteriaMet = Object.values(passwordCriteria).filter(Boolean).length;
                setPasswordStrength(criteriaMet);
                if (!value) error = 'Password is required.';
                else if (criteriaMet < 4) error = 'Password does not meet all requirements.';
                if (form.confirmPassword) validateField('confirmPassword', form.confirmPassword);
                break;
            case 'confirmPassword':
                if (!value) error = 'Please confirm your password.';
                else if (value !== form.password) error = 'Passwords do not match.';
                break;
        }
        setErrors(prev => ({ ...prev, [name]: error }));
        return error;
    }, [form.password, form.confirmPassword, passwordCriteria, authMode, api]);

    const handleBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setTouched(prev => ({ ...prev, [name]: true }));
        
        if (name === 'companyName' && value.length >= 3) {
            setIsChecking(prev => ({ ...prev, companyName: true }));
            
            // Check for canonical name to ensure case-insensitive matching works for existing companies
            const canonicalName = await api.getCanonicalCompanyName(value);
            
            if (canonicalName) {
                setCompanyExists(true);
                // If the user typed "acme" but the DB has "Acme", update the form to match DB.
                // This prevents the backend trigger from failing on unique constraint violations.
                if (canonicalName !== value) {
                    setForm(prev => ({ ...prev, companyName: canonicalName }));
                }
            } else {
                setCompanyExists(false);
            }
            
            setIsChecking(prev => ({ ...prev, companyName: false }));
        } else if (name === 'companyName') {
            setCompanyExists(null);
        }
        validateField(name, value);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
        if (touched[name]) {
            validateField(name, value);
        }
        if (name === 'password') {
            const criteriaMet = Object.values({
                length: value.length >= 8,
                uppercase: /[A-Z]/.test(value),
                number: /[0-9]/.test(value),
                specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(value),
            }).filter(Boolean).length;
             setPasswordStrength(criteriaMet);
        }
    };
    
    const isSignUpFormValid = useMemo(() => {
        return Object.values(errors).every(e => e === null) &&
               Object.values(isChecking).every(c => !c) &&
               form.companyName && form.email && form.fullName && form.password && form.confirmPassword;
    }, [errors, isChecking, form]);

    const handleSignIn = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.email || !form.password) {
            showToast("Please enter both email and password.", "error");
            return;
        }
        setIsLoading(true);
        setShowResendLink(false);
        setIsSlowConnection(false);

        // Notify parent that we are starting the login process (enables race-condition guard)
        if (onLoginStart) onLoginStart();

        // Trigger "slow" warning after 3 seconds (database might be waking up)
        const slowTimer = setTimeout(() => setIsSlowConnection(true), 3000);

        try {
            const cleanEmail = form.email.trim().toLowerCase();
            // Race condition to handle potential backend hanging/timeouts
            const loginPromise = api.login(cleanEmail, form.password);
            // RELIABILITY: Increased timeout to 45s to handle database cold starts
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Login attempt timed out. The secure database is taking longer than expected to wake up. Please check your internet connection or try again.")), 45000)
            );

            const user = await Promise.race([loginPromise, timeoutPromise]) as User | null;

            if (user) {
                onLoginSuccess(user);
            } else {
                // If user is null, it usually means invalid credentials as handled by api.login catch/return
                showToast("Invalid email or password.", "error");
            }
        } catch (error: any) {
            console.error("Login error:", error);
            if (error.message && error.message.toLowerCase().includes("email not confirmed")) {
                 showToast("Please verify your email address before logging in.", "error");
                 setShowResendLink(true);
            } else if (error.message === "Invalid login credentials") {
                 showToast("Invalid email or password. Please check your credentials.", "error");
            } else {
                 showToast(error.message || "An unexpected error occurred during sign in.", "error");
            }
        } finally {
            clearTimeout(slowTimer);
            setIsLoading(false);
            setIsSlowConnection(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setDbSetupScript(null);
        
        // Mark all fields as touched to show errors
        setTouched({ companyName: true, fullName: true, email: true, password: true, confirmPassword: true });
        
        // We must check company name before validating, since its existence is not an error
        setIsChecking(prev => ({ ...prev, companyName: true }));
        // Use canonical check again on submit to be safe
        const canonicalName = await api.getCanonicalCompanyName(form.companyName);
        const exists = !!canonicalName;
        if (canonicalName && canonicalName !== form.companyName) {
             setForm(prev => ({ ...prev, companyName: canonicalName }));
        }
        
        setCompanyExists(exists);
        setIsChecking(prev => ({ ...prev, companyName: false }));
        
        // Validate all fields
        const validations = await Promise.all(Object.keys(form).map(key => validateField(key, form[key as keyof typeof form])));
        const isFormValidOnSubmit = validations.every(v => v === null);

        if (!isFormValidOnSubmit) {
            showToast("Please fix the errors before submitting.", "error");
            return;
        }
        setIsLoading(true);
        try {
            const cleanEmail = form.email.trim().toLowerCase();
            // Pass the potentially corrected company name (canonicalName or form.companyName)
            const finalCompanyName = canonicalName || form.companyName;
            const newUser = await api.signUp(form.fullName, cleanEmail, form.password, finalCompanyName);
            
            if (exists) {
                showToast(`Successfully joined ${finalCompanyName}! Welcome.`, "success");
            } else {
                showToast("Company and Admin account created! Welcome.", "success");
            }
            onLoginSuccess(newUser);
        } catch (error: any) {
            // Improved Error Parsing to prevent [object Object]
            let msg = "Failed to create account.";
            
            if (typeof error === 'string') {
                msg = error;
            } else if (error instanceof Error) {
                msg = error.message;
            } else if (error && typeof error === 'object') {
                // Check standard Supabase/Postgrest error fields
                msg = error.message || error.error_description || error.details || error.hint;
                
                // Last resort: safe stringify
                if (!msg) {
                    try {
                        msg = JSON.stringify(error);
                        if (msg === '{}') msg = "An unknown error occurred.";
                    } catch (e) {
                        msg = "An unknown error occurred.";
                    }
                }
            }

            // Prevent [object Object] at all costs
            if (String(msg).includes('[object Object]')) {
                msg = "A database error occurred. Please check the console for details.";
            }

            console.error("Sign Up Error Details:", error);

            const lowerMsg = String(msg).toLowerCase();

            if (lowerMsg.includes("check your email")) {
                 showToast(msg, "success");
                 setAuthMode('signin');
            } else if (lowerMsg.includes("user already registered") || lowerMsg.includes("already registered")) {
                 showToast("This email is already registered. Please sign in.", "error");
            } else if (lowerMsg.includes("database setup required") || lowerMsg.includes("policy change") || lowerMsg.includes("row-level security") || lowerMsg.includes("permission denied")) {
                 const script = `
-- 1. RESET & GRANT PERMISSIONS (Crucial Step)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE companies TO anon, authenticated, service_role;
GRANT ALL ON TABLE user_profiles TO anon, authenticated, service_role;

-- 2. ALLOW ANONYMOUS & AUTHENTICATED ACCESS TO COMPANIES
DROP POLICY IF EXISTS "Enable read access for all users" ON companies;
DROP POLICY IF EXISTS "Enable insert for all users" ON companies;
DROP POLICY IF EXISTS "Insert company" ON companies;
CREATE POLICY "Enable read access for all users" ON companies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all users" ON companies FOR INSERT TO anon, authenticated WITH CHECK (true);

-- 3. USER PROFILE TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, company_id, email, full_name, role, avatar_url)
  VALUES (
    new.id,
    (new.raw_user_meta_data->>'company_id')::uuid,
    new.email,
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'role', 'Clerk'),
    'https://ui-avatars.com/api/?name=' || replace(new.raw_user_meta_data->>'full_name', ' ', '+')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 4. ADD MISSING AUDIT COLUMNS (If tables created early)
ALTER TABLE cash_ins ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE cash_ins ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE cash_outs ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS created_by_name text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_by_name text;

-- 5. PERMISSIONS FOR FINANCIAL TABLES
GRANT ALL ON TABLE cash_ins TO anon, authenticated, service_role;
GRANT ALL ON TABLE cash_outs TO anon, authenticated, service_role;
GRANT ALL ON TABLE incomes TO anon, authenticated, service_role;
GRANT ALL ON TABLE expenses TO anon, authenticated, service_role;

-- 6. RLS POLICIES FOR FINANCIAL TABLES
ALTER TABLE cash_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE incomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for cash_ins" ON cash_ins;
DROP POLICY IF EXISTS "Enable all access for cash_outs" ON cash_outs;
DROP POLICY IF EXISTS "Enable all access for incomes" ON incomes;
DROP POLICY IF EXISTS "Enable all access for expenses" ON expenses;

CREATE POLICY "Enable all access for cash_ins" ON cash_ins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for cash_outs" ON cash_outs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for incomes" ON incomes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for expenses" ON expenses FOR ALL USING (true) WITH CHECK (true);
                 `;
                 setDbSetupScript(script);
                 showToast("DATABASE SETUP REQUIRED: Copy the script below.", "error");
            } else {
                 showToast(msg, "error");
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.email) {
            showToast("Please enter your email address.", "error");
            return;
        }
        setIsLoading(true);
        try {
            const cleanEmail = form.email.trim().toLowerCase();
            const result = await api.resetPassword(cleanEmail);
            if (result.success) {
                showToast("Reset link sent! Check your email inbox.", "success");
                setAuthMode('signin');
            } else {
                showToast(result.error || "Failed to send reset link.", "error");
            }
        } catch (error: any) {
            showToast(error.message || "Failed to send reset link.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const handleResend = async () => {
        if (!form.email) return;
        setIsLoading(true);
        try {
            const cleanEmail = form.email.trim().toLowerCase();
            const res = await api.resendConfirmationEmail(cleanEmail);
            if (res.success) {
                showToast("Confirmation email resent. Please check your inbox.", "success");
                setShowResendLink(false);
            } else {
                showToast(res.error || "Failed to resend.", "error");
            }
        } catch (e) {
            showToast("Failed to resend email.", "error");
        } finally {
            setIsLoading(false);
        }
    }
    
    const getInputClass = (name: string) => `w-full p-2 pl-10 border rounded bg-white dark:bg-slate-700 dark:border-slate-600 focus:ring-primary-500 focus:border-primary-500 transition-colors ${touched[name] && errors[name] ? 'border-red-500' : ''}`;
    const ErrorMessage: FC<{ name: string }> = ({ name }) => touched[name] && errors[name] ? <p className="text-red-500 text-xs mt-1">{errors[name]}</p> : null;

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-4 overflow-y-auto">
            <Card className="w-full max-w-sm animate-fade-in-up my-8">
                <h1 className="text-3xl font-bold text-primary-600 mb-2 text-center">FinTrack Pro</h1>
                <p className="text-center text-slate-500 dark:text-slate-400 mb-6">
                    {authMode === 'signin' && 'Welcome back! Please sign in.'}
                    {authMode === 'signup' && 'Create your company account.'}
                    {authMode === 'forgot-password' && 'Recover your account.'}
                </p>

                {dbSetupScript && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-900">
                        <div className="flex items-start gap-2 mb-2">
                            <LoadingSpinnerIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
                            <p className="font-bold">Setup Required:</p>
                        </div>
                        <p className="mb-2">The database is blocking writes. Please run this SQL script in your Supabase SQL Editor to fix permissions:</p>
                        <pre className="bg-slate-800 text-white p-2 rounded text-xs overflow-x-auto select-all">
                            {dbSetupScript}
                        </pre>
                        <button 
                            onClick={() => setDbSetupScript(null)}
                            className="mt-3 w-full py-1 px-2 bg-red-100 hover:bg-red-200 text-red-800 rounded text-xs font-semibold"
                        >
                            I have run the script, try again
                        </button>
                    </div>
                )}

                {authMode === 'signin' && (
                    <form onSubmit={handleSignIn} className="space-y-4">
                        <div>
                            <div className="relative">
                                <EmailIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input ref={emailInputRef} type="email" placeholder="Email (e.g. admin@fintrack.com)" value={form.email} onChange={handleChange} name="email" required className={getInputClass('email')} />
                            </div>
                        </div>
                        <div>
                            <div className="relative">
                                <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input type={passwordVisibility.password ? 'text' : 'password'} placeholder="Password" value={form.password} onChange={handleChange} name="password" required className={`${getInputClass('password')} pr-10`} />
                                <button type="button" onClick={() => togglePasswordVisibility('password')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Toggle password visibility">
                                    {passwordVisibility.password ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>
                         <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                <input type="checkbox" className="rounded text-primary-600 focus:ring-primary-500"/>
                                Remember me
                            </label>
                            <button type="button" onClick={() => setAuthMode('forgot-password')} className="font-medium text-primary-600 hover:text-primary-500">Forgot password?</button>
                        </div>
                        <div className="space-y-2">
                             <button type="submit" disabled={isLoading} className="w-full bg-primary-600 text-white p-2.5 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                                {isLoading ? 'Signing In...' : 'Sign In'}
                            </button>
                            {isSlowConnection && (
                                <p className="text-xs text-yellow-600 dark:text-yellow-400 text-center animate-pulse">
                                    Waking up secure database... This may take up to a minute.
                                </p>
                            )}
                        </div>
                        
                        {showResendLink && (
                             <button type="button" onClick={handleResend} disabled={isLoading} className="w-full bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 p-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 text-sm">
                                {isLoading ? 'Sending...' : 'Resend Confirmation Email'}
                            </button>
                        )}
                        
                        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                            Don't have an account?
                            <button onClick={() => setAuthMode('signup')} className="font-medium text-primary-600 hover:text-primary-500 ml-1">
                                Sign up
                            </button>
                        </p>
                    </form>
                )}
                
                {authMode === 'signup' && (
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div>
                            <div className="relative">
                                <BuildingOfficeIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input ref={companyInputRef} type="text" placeholder="Company Name" name="companyName" value={form.companyName} onChange={handleChange} onBlur={handleBlur} required className={getInputClass('companyName')} />
                                {isChecking.companyName && <LoadingSpinnerIcon className="w-4 h-4 text-slate-400 absolute top-1/2 right-3 -translate-y-1/2 animate-spin" />}
                            </div>
                            <ErrorMessage name="companyName" />
                            {!isChecking.companyName && companyExists === true && !errors.companyName && (
                                <p className="text-green-600 text-xs mt-1">✓ You will be joining this existing company as a Clerk.</p>
                            )}
                            {!isChecking.companyName && companyExists === false && !errors.companyName && (
                                <p className="text-blue-600 text-xs mt-1">✓ A new company will be created and you will be the Admin.</p>
                            )}
                        </div>
                        <div>
                            <div className="relative">
                                <UserIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input type="text" placeholder="Your Full Name (Admin)" name="fullName" value={form.fullName} onChange={handleChange} onBlur={handleBlur} required className={getInputClass('fullName')} />
                            </div>
                            <ErrorMessage name="fullName" />
                        </div>
                        <div>
                            <div className="relative">
                                <EmailIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input type="email" placeholder="Your Email" name="email" value={form.email} onChange={handleChange} onBlur={handleBlur} required className={getInputClass('email')} />
                                {isChecking.email && <LoadingSpinnerIcon className="w-4 h-4 text-slate-400 absolute top-1/2 right-3 -translate-y-1/2 animate-spin" />}
                            </div>
                            <ErrorMessage name="email" />
                        </div>
                        <div>
                            <div className="relative">
                                <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input type={passwordVisibility.password ? 'text' : 'password'} placeholder="Password" name="password" value={form.password} onChange={handleChange} onBlur={handleBlur} required className={`${getInputClass('password')} pr-10`} />
                                <button type="button" onClick={() => togglePasswordVisibility('password')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Toggle password visibility">
                                    {passwordVisibility.password ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                </button>
                            </div>
                            <div className="mt-2 space-y-2">
                                <PasswordStrengthMeter strength={passwordStrength} />
                                <ul className="grid grid-cols-2 gap-x-4">
                                    <PasswordRequirement text="8+ characters" met={passwordCriteria.length} />
                                    <PasswordRequirement text="1 uppercase" met={passwordCriteria.uppercase} />
                                    <PasswordRequirement text="1 number" met={passwordCriteria.number} />
                                    <PasswordRequirement text="1 special char" met={passwordCriteria.specialChar} />
                                </ul>
                            </div>
                            <ErrorMessage name="password" />
                        </div>
                        <div>
                            <div className="relative">
                                <LockClosedIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input type={passwordVisibility.confirmPassword ? 'text' : 'password'} placeholder="Confirm Password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} onBlur={handleBlur} required className={`${getInputClass('confirmPassword')} pr-10`} />
                                <button type="button" onClick={() => togglePasswordVisibility('confirmPassword')} className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Toggle confirm password visibility">
                                    {passwordVisibility.confirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                                </button>
                            </div>
                            <ErrorMessage name="confirmPassword" />
                        </div>
                        <button type="submit" disabled={isLoading || !isSignUpFormValid} className="w-full bg-primary-600 text-white p-2.5 rounded-lg hover:bg-primary-700 disabled:bg-primary-400 disabled:cursor-not-allowed">
                            {isLoading ? 'Creating Account...' : 'Create Company & Sign Up'}
                        </button>
                        
                        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
                            Already have an account?
                            <button onClick={() => setAuthMode('signin')} className="font-medium text-primary-600 hover:text-primary-500 ml-1">
                                Sign in
                            </button>
                        </p>
                    </form>
                )}
                
                {authMode === 'forgot-password' && (
                     <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="text-sm text-slate-600 dark:text-slate-300 text-center mb-4">
                            Enter your email address and we'll send you a link to reset your password.
                        </div>
                        <div>
                            <div className="relative">
                                <EmailIcon className="w-5 h-5 text-slate-400 absolute top-1/2 left-3 -translate-y-1/2" />
                                <input ref={forgotEmailInputRef} type="email" placeholder="Email Address" value={form.email} onChange={handleChange} name="email" required className={getInputClass('email')} />
                            </div>
                        </div>
                        <button type="submit" disabled={isLoading} className="w-full bg-primary-600 text-white p-2.5 rounded-lg hover:bg-primary-700 disabled:bg-primary-400">
                            {isLoading ? 'Sending Link...' : 'Send Reset Link'}
                        </button>
                        <button type="button" onClick={() => setAuthMode('signin')} className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mt-4">
                            <ArrowLeftIcon className="w-4 h-4" /> Back to Sign In
                        </button>
                    </form>
                )}
            </Card>
        </div>
    );
};

export default AuthPage;

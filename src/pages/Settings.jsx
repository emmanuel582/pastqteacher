import { useState } from 'react';
import { ArrowUpRight, GraduationCap, Wallet } from 'lucide-react';
import { request, useResource } from '../data';
import { mediaUrl } from '../api';
import { Heading, Button, ErrorBox } from '../components';
export default function Settings({ profile, notify, version }) {
  const [form, setForm] = useState({
      name: profile.name,
      organization: profile.organization,
      logo: profile.logo,
    }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const payments = useResource('/teacher/payments', version);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await request('/teacher/profile', { method: 'PUT', body: form });
      notify('Workspace details saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function logo(file) {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      const result = await request('/teacher/logo', { method: 'POST', body });
      setForm((f) => ({ ...f, logo: result.logo }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function connect() {
    setBusy(true);
    setError('');
    try {
      const result = await request('/teacher/payments/connect', { method: 'POST' });
      location.assign(result.url);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        eyebrow="WORKSPACE SETTINGS"
        title="Workspace settings"
        text="The details students see and the account your earnings go to."
      />
      <div className="settings-grid">
        <section className="panel padded">
          <h2>Workspace identity</h2>
          <p className="panel-copy">The name and logo students see on your exams.</p>
          <form className="form-stack" onSubmit={save}>
            <label>
              Your name
              <input
                required
                maxLength={160}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              School or organization
              <input
                maxLength={200}
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
              />
            </label>
            <label>
              Workspace logo
              <div className="logo-upload">
                {form.logo ? (
                  <img src={mediaUrl(form.logo)} alt="Workspace logo" />
                ) : (
                  <GraduationCap size={34} />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Upload workspace logo"
                  onChange={(e) => logo(e.target.files[0])}
                />
              </div>
            </label>
            <ErrorBox error={error} />
            <Button variant="primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save changes'}
            </Button>
          </form>
        </section>
        <section className="panel padded">
          <span className="eyebrow">POWERED BY BACHS</span>
          <h2>Bachs payment account</h2>
          <p className="panel-copy">
            Use Bachs’ secure onboarding to connect your payment account. Your banking details stay
            with Bachs.
          </p>
          <div className="payment-state">
            <Wallet size={30} />
            <strong>
              {payments.data?.account
                ? 'Account connected'
                : payments.data?.configured
                  ? 'Ready to connect'
                  : 'Server setup needed'}
            </strong>
            <span>
              {payments.data?.environment === 'live' ? 'Live payments' : 'Sandbox environment'}
            </span>
          </div>
          <Button
            variant="primary"
            icon={ArrowUpRight}
            disabled={busy || !payments.data?.configured}
            onClick={connect}
          >
            {payments.data?.account ? 'Manage Bachs onboarding' : 'Connect with Bachs'}
          </Button>
          <p className="fine-print">
            Paid publishing requires an active collection capability for the exam’s currency. Free
            exams are always available.
          </p>
          <ErrorBox error={payments.error} />
        </section>
      </div>
    </>
  );
}

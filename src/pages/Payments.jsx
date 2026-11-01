import { PaymentCards } from '../ResultCards';

import { ArrowUpRight, Check, Download, Wallet } from 'lucide-react';
import { useResource } from '../data';
import { exportCsv } from '../api';
import { Heading, Badge, Button, Empty, ErrorBox, Loading, Stat, money, when } from '../components';
export default function Payments({ version, go }) {
  const data = useResource('/teacher/payments', version);
  if (data.loading) return <Loading />;
  const orders = data.data?.orders || [],
    paid = orders.filter((o) => o.status === 'paid');
  return (
    <>
      <Heading
        eyebrow="BACHS PAYMENTS"
        title="Exam earnings"
        text="Track verified exam payments and connect your Bachs account."
        action={
          <Button onClick={() => go('settings')}>
            Payment settings <ArrowUpRight size={16} />
          </Button>
        }
      />
      <ErrorBox error={data.error} />
      <div className="payment-callout">
        <Wallet size={28} />
        <div>
          <h3>
            {data.data?.account
              ? 'Your Bachs account is connected.'
              : 'Connect your payment account'}
          </h3>
          <p>
            {data.data?.configured
              ? `Bachs ${data.data.environment} · Payments are confirmed by signed webhooks.`
              : 'Bachs is not configured on this server yet. You can create and run free exams.'}
          </p>
        </div>
        <Badge status={data.data?.account ? 'open' : 'draft'}>
          {data.data?.account ? 'Connected' : 'Setup needed'}
        </Badge>
      </div>
      <div className="stats-grid three">
        <Stat
          label="Verified payments"
          value={paid.length}
          foot="Confirmed by Bachs"
          icon={Check}
        />
        {['NGN', 'USD'].map((c) => (
          <Stat
            key={c}
            label={`${c} gross collections`}
            value={money(
              paid.filter((o) => o.currency === c).reduce((s, o) => s + o.amount, 0),
              c,
            )}
            foot="Before provider fees and payouts"
            icon={Wallet}
          />
        ))}
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Exam payments</h2>
          <Button
            icon={Download}
            disabled={!orders.length}
            onClick={() =>
              exportCsv(
                orders.map(({ id, examId, name, email, amount, currency, status, createdAt }) => ({
                  id,
                  examId,
                  name,
                  email,
                  amount: (amount / 100).toFixed(2),
                  currency,
                  status,
                  createdAt,
                })),
                'exam-payments',
              )
            }
          >
            Export
          </Button>
        </div>
        {orders.length ? (
          <>
            <PaymentCards rows={orders} />
            <div className="table-scroll payments-table">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.name || o.email}</strong>
                        <small>{o.email}</small>
                      </td>
                      <td>{money(o.amount, o.currency)}</td>
                      <td>
                        <Badge status={o.status === 'paid' ? 'open' : 'draft'}>{o.status}</Badge>
                      </td>
                      <td>{when(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <Empty
            title="Your first payment will appear here."
            text="Set a price on an exam after connecting Bachs."
            icon={Wallet}
          />
        )}
      </section>
    </>
  );
}

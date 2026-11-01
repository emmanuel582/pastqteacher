import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './fonts.css';
import './theme.css';
import './styles.css';
import './mobile.css';
class Boundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Your workspace couldn’t open.</h1>
        <button onClick={() => location.reload()}>Reload workspace</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')).render(
  <Boundary>
    <App />
  </Boundary>,
);

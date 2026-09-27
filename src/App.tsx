import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>WorkBooks</h1>
        <p>Simple books for people who work.</p>
      </header>

      <section className="home">
        <h2>Today</h2>

        <div className="empty-state">
          <p>No jobs scheduled for today.</p>
        </div>

        <div className="home-actions">
          <button className="primary-button">
            + New Customer & Job
          </button>

          <button className="secondary-button">
            + Add Job
          </button>
        </div>
      </section>

      <nav className="bottom-nav">
        <button>Home</button>
        <button>Jobs</button>
        <button>Customers</button>
        <button>Finances</button>
      </nav>
    </main>
  );
}

export default App;
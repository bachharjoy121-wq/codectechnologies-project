const { useState, useEffect, useRef } = React;

function App() {
  const [transactions, setTransactions] = useState([]);
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("expenseData");
    if (stored) setTransactions(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem("expenseData", JSON.stringify(transactions));
  }, [transactions]);

  const addTransaction = () => {
    if (!amount || !date) return alert("Fill all required fields");
    const newItem = {
      id: Date.now(),
      type,
      amount: Number(amount),
      category,
      date,
      desc
    };
    setTransactions([...transactions, newItem]);
    setAmount("");
    setCategory("");
    setDate("");
    setDesc("");
  };

  const deleteItem = (id) => {
    setTransactions(transactions.filter(item => item.id !== id));
  };

  return (
    <div className="container">
      <h1>Expense Tracker with Budget Insights</h1>

      <select onChange={e => setType(e.target.value)}>
        <option value="expense">Expense</option>
        <option value="income">Income</option>
      </select>

      <input placeholder="Amount" value={amount} onChange={e=>setAmount(e.target.value)} />
      <input placeholder="Category" value={category} onChange={e=>setCategory(e.target.value)} />
      <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
      <input placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)} />

      <button onClick={addTransaction}>Add Transaction</button>

      <ChartView transactions={transactions} />

      <div style={{marginTop:"10px"}}>
        <button onClick={() => window.print()}>Export PDF</button>
        <button onClick={() => exportCSV(transactions)}>Export CSV</button>
      </div>

      <table border="1" width="100%" style={{marginTop:"10px"}}>
        <thead>
          <tr>
            <th>Date</th><th>Type</th><th>Amount</th>
            <th>Category</th><th>Description</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map(tx => (
            <tr key={tx.id}>
              <td>{tx.date}</td>
              <td>{tx.type}</td>
              <td>{tx.amount}</td>
              <td>{tx.category}</td>
              <td>{tx.desc}</td>
              <td><button onClick={() => deleteItem(tx.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartView({ transactions }) {
  const canvasRef = React.useRef(null);
  const chartRef = React.useRef(null);

  React.useEffect(() => {
    let income = 0, expense = 0;

    transactions.forEach(tx => {
      if (tx.type === "income") income += tx.amount;
      else expense += tx.amount;
    });

    const ctx = canvasRef.current.getContext("2d");

    if (chartRef.current) {
      chartRef.current.destroy();   // FIX: destroy old chart
    }

    chartRef.current = new Chart(ctx, {
      type: "pie",
      data: {
        labels: ["Income", "Expense"],
        datasets: [{
          data: [income, expense]
        }]
      }
    });
  }, [transactions]);

  return <canvas ref={canvasRef}></canvas>;
}

function exportCSV(data) {
  let csv = "Date,Type,Amount,Category,Description\n";
  data.forEach(row => {
    csv += `${row.date},${row.type},${row.amount},${row.category},${row.desc}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "expenses.csv";
  link.click();
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);

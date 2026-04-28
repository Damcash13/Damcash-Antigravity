import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Todo {
  id: string;
  name: string;
}

export const SupabaseTodos: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTodos() {
      try {
        setLoading(true);
        const { data, error: sbError } = await supabase.from('todos').select();
        
        if (sbError) {
          throw sbError;
        }
        
        setTodos(data || []);
      } catch (err: any) {
        console.error('Error fetching todos:', err);
        setError(err.message);
      } finally {
        setLoading(setLoading(false) as any);
      }
    }

    fetchTodos();
  }, []);

  return (
    <div className="p-8 max-w-2xl mx-auto bg-card rounded-xl shadow-lg mt-10">
      <h1 className="text-3xl font-bold mb-6 text-primary flex items-center gap-3">
        <span className="text-4xl">📝</span> Supabase Todos
      </h1>
      
      {loading && (
        <div className="flex items-center gap-2 text-text-2">
          <div className="spinner-small" /> Loading your data...
        </div>
      )}
      
      {error && (
        <div className="p-4 bg-danger/10 border border-danger/20 text-danger rounded-lg mb-4">
          Error: {error}
        </div>
      )}

      <ul className="space-y-3">
        {todos.length === 0 && !loading && !error && (
          <li className="text-text-2 italic">No todos found in the 'todos' table.</li>
        )}
        {todos.map((todo) => (
          <li 
            key={todo.id} 
            className="p-4 bg-background-2 border border-border rounded-lg hover:border-primary/50 transition-colors shadow-sm"
          >
            <span className="font-medium">{todo.name}</span>
          </li>
        ))}
      </ul>
      
      <div className="mt-8 text-sm text-text-3 border-t border-border pt-4">
        <p>This component is pulling live data from your Supabase project.</p>
        <p className="mt-1">URL: <code>{(import.meta as any).env?.VITE_SUPABASE_URL}</code></p>
      </div>
    </div>
  );
};

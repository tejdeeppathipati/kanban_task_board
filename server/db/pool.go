package db

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps a pgxpool.Pool and provides helpers for RLS-scoped queries.
type Pool struct {
	pool *pgxpool.Pool
}

// New creates a new database pool from the given connection string.
func New(ctx context.Context, connString string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(connString)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("creating connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pinging database: %w", err)
	}

	return &Pool{pool: pool}, nil
}

// Close shuts down the connection pool.
func (p *Pool) Close() {
	p.pool.Close()
}

// RLSClaims contains the JWT claims needed for Supabase RLS policies.
type RLSClaims struct {
	Sub   string `json:"sub"`
	Role  string `json:"role"`
	Email string `json:"email,omitempty"`
	Aud   string `json:"aud,omitempty"`
}

// QueryFunc is a function that executes queries within an RLS-scoped transaction.
type QueryFunc func(ctx context.Context, tx pgx.Tx) error

// WithRLS runs the given function inside a transaction that has Supabase RLS
// context set. This lets the existing PostgreSQL RLS policies enforce row-level
// isolation without duplicating any security logic in Go.
//
// The approach:
//  1. Begin a transaction
//  2. SET LOCAL role = 'authenticated'
//  3. SET LOCAL request.jwt.claims = '<claims JSON>'
//  4. Execute the caller's function
//  5. Commit (or rollback on error)
func (p *Pool) WithRLS(ctx context.Context, userID string, fn QueryFunc) error {
	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("beginning transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	claims := RLSClaims{
		Sub:  userID,
		Role: "authenticated",
		Aud:  "authenticated",
	}
	claimsJSON, err := json.Marshal(claims)
	if err != nil {
		return fmt.Errorf("marshaling claims: %w", err)
	}

	// Switch to the authenticated role so RLS policies evaluate correctly.
	if _, err := tx.Exec(ctx, "SET LOCAL role = 'authenticated'"); err != nil {
		return fmt.Errorf("setting role: %w", err)
	}

	// Inject the JWT claims so auth.uid() and auth.jwt() work inside RLS policies.
	if _, err := tx.Exec(ctx, fmt.Sprintf("SET LOCAL request.jwt.claims = '%s'", string(claimsJSON))); err != nil {
		return fmt.Errorf("setting jwt claims: %w", err)
	}

	if err := fn(ctx, tx); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("committing transaction: %w", err)
	}

	return nil
}

// Underlying returns the raw pgxpool.Pool for health checks or direct queries
// that don't need RLS (e.g., schema introspection).
func (p *Pool) Underlying() *pgxpool.Pool {
	return p.pool
}

#!/usr/bin/env python3
"""
Send Time Optimizer

Uses historical data to predict best time to send email to maximize open rate
"""

import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
import joblib
import psycopg2
from datetime import datetime
import os
import sys
import json
import argparse

class SendTimeOptimizer:

    def __init__(self, db_config):
        self.db_config = db_config
        self.model = None
        self.feature_columns = None

    def fetch_training_data(self):
        """Fetch email outcomes with send time and open rate"""

        conn = psycopg2.connect(**self.db_config)

        query = """
        SELECT
            EXTRACT(DOW FROM sent_at) as day_of_week,
            EXTRACT(HOUR FROM sent_at) as hour_of_day,
            CASE WHEN opened THEN 1 ELSE 0 END as opened,

            -- Company features
            COALESCE(c.industry, 'unknown') as industry,
            COALESCE(c.size_bucket, 'unknown') as size_bucket,

            -- Person features
            COALESCE(p.function, 'unknown') as function,
            COALESCE(p.location, 'unknown') as location

        FROM email_outcomes eo
        LEFT JOIN companies c ON c.id = eo.company_id
        LEFT JOIN people p ON p.id = eo.person_id

        WHERE
            eo.sent_at > NOW() - INTERVAL '180 days'
            AND eo.delivered = TRUE
        """

        try:
            df = pd.read_sql(query, conn)
        except Exception as e:
            print(f"Error fetching data: {e}")
            df = pd.DataFrame()
        finally:
            conn.close()

        return df

    def train(self):
        """Train the model"""

        print("Fetching send time data...")
        df = self.fetch_training_data()

        if len(df) < 100:
            print(f"⚠️  Insufficient training data ({len(df)} samples). Creating dummy model...")
            self._create_dummy_model()
            return

        print(f"Training on {len(df)} email sends")

        # Group by time slots and calculate open rate
        df_agg = df.groupby([
            'day_of_week', 'hour_of_day', 'industry', 'function'
        ]).agg({
            'opened': ['mean', 'count']
        }).reset_index()

        df_agg.columns = ['day_of_week', 'hour_of_day', 'industry', 'function', 'open_rate', 'sample_size']

        # Filter for sufficient sample size
        df_agg = df_agg[df_agg['sample_size'] >= 5]

        if len(df_agg) < 50:
            print(f"⚠️  Insufficient aggregated data ({len(df_agg)} groups). Creating dummy model...")
            self._create_dummy_model()
            return

        print(f"Training on {len(df_agg)} time slot aggregates")

        X = df_agg[['day_of_week', 'hour_of_day', 'industry', 'function']]
        y = df_agg['open_rate']

        # One-hot encode
        X = pd.get_dummies(X, drop_first=True)
        self.feature_columns = X.columns.tolist()

        # Train
        self.model = RandomForestRegressor(
            n_estimators=100,
            max_depth=10,
            random_state=42,
            n_jobs=-1
        )
        self.model.fit(X, y)

        # Evaluate
        y_pred = self.model.predict(X)
        mae = np.mean(np.abs(y - y_pred))

        print(f"✅ Send Time Optimizer trained")
        print(f"MAE: {mae:.4f}")

        # Save
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
        os.makedirs(model_dir, exist_ok=True)

        model_path = os.path.join(model_dir, 'send_time_optimizer.pkl')
        joblib.dump({
            'model': self.model,
            'feature_columns': self.feature_columns
        }, model_path)

        print(f"Model saved to {model_path}")

        # Register in database
        self._register_model(model_path, mae, len(df_agg))

    def _create_dummy_model(self):
        """Create dummy model for insufficient data"""
        from sklearn.dummy import DummyRegressor

        self.model = DummyRegressor(strategy='constant', constant=0.3)
        self.feature_columns = ['dummy']
        self.model.fit([[0]], [0.3])

        model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
        os.makedirs(model_dir, exist_ok=True)

        model_path = os.path.join(model_dir, 'send_time_optimizer_dummy.pkl')
        joblib.dump({
            'model': self.model,
            'feature_columns': self.feature_columns
        }, model_path)

        print(f"Dummy model saved to {model_path}")
        self._register_model(model_path, 0.0, 0)

    def predict_best_time(self, company_industry, person_function):
        """Predict best send time for a specific recipient"""

        if self.model is None:
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
            model_files = [f for f in os.listdir(model_dir) if f.startswith('send_time_optimizer')]

            if not model_files:
                # Return default best time: Tuesday 10 AM
                return {
                    'day_of_week': 2,
                    'hour_of_day': 10,
                    'predicted_open_rate': 0.3
                }

            latest_model = sorted(model_files)[-1]
            model_path = os.path.join(model_dir, latest_model)

            loaded = joblib.load(model_path)
            self.model = loaded['model']
            self.feature_columns = loaded['feature_columns']

        # Generate all possible time slots (7 days × 24 hours = 168 slots)
        # But we'll focus on business hours for practicality
        slots = []
        for day in range(7):  # Monday=1 to Sunday=0
            for hour in range(7, 19):  # 7 AM to 6 PM
                slots.append({
                    'day_of_week': day,
                    'hour_of_day': hour,
                    'industry': company_industry,
                    'function': person_function
                })

        df = pd.DataFrame(slots)
        df = pd.get_dummies(df, drop_first=True)

        # Add missing columns
        for col in self.feature_columns:
            if col not in df.columns:
                df[col] = 0

        # Reorder to match training
        df = df[self.feature_columns]

        # Predict open rate for each slot
        predictions = self.model.predict(df)

        # Find best slot
        best_idx = np.argmax(predictions)
        best_slot = slots[best_idx]

        return {
            'day_of_week': int(best_slot['day_of_week']),
            'hour_of_day': int(best_slot['hour_of_day']),
            'predicted_open_rate': float(predictions[best_idx])
        }

    def _register_model(self, model_path, mae, training_samples):
        """Register trained model in database"""

        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor()

            cur.execute("""
                INSERT INTO ml_models (
                    model_name, model_version, model_type, model_path,
                    feature_columns, metrics, status, deployed_at, training_samples
                ) VALUES (
                    'send_time_optimizer',
                    %s,
                    'random_forest',
                    %s,
                    %s,
                    %s,
                    'deployed',
                    NOW(),
                    %s
                )
            """, [
                datetime.now().strftime('%Y%m%d'),
                model_path,
                json.dumps(self.feature_columns),
                json.dumps({'mae': mae}),
                training_samples
            ])

            conn.commit()
            cur.close()
            conn.close()

            print(f"✅ Model registered in database")
        except Exception as e:
            print(f"⚠️  Failed to register model in database: {e}")

# Training/prediction script
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--predict', type=str, help='JSON input for prediction')
    args = parser.parse_args()

    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 5432)),
        'database': os.getenv('DB_NAME', 'upr'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', '')
    }

    optimizer = SendTimeOptimizer(db_config)

    if args.predict:
        # Prediction mode
        input_data = json.loads(args.predict)
        result = optimizer.predict_best_time(
            input_data.get('industry', 'unknown'),
            input_data.get('function', 'unknown')
        )
        print(json.dumps(result))

    else:
        # Training mode
        try:
            optimizer.train()
            print(f"\n✅ Send Time Optimizer training complete!")
        except Exception as e:
            print(f"\n❌ Training failed: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

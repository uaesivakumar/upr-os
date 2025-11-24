#!/usr/bin/env python3
"""
Conversion Probability Predictor

Predicts likelihood of email conversion using XGBoost
Trained on historical email_outcomes data
"""

import pandas as pd
import numpy as np
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import roc_auc_score, classification_report
import joblib
import json
import psycopg2
from datetime import datetime
import os
import sys
import argparse

class ConversionPredictor:

    def __init__(self, db_config):
        self.db_config = db_config
        self.model = None
        self.feature_columns = None

    def fetch_training_data(self):
        """Fetch features + labels from database"""

        conn = psycopg2.connect(**self.db_config)

        query = """
        SELECT
            -- Company features (from feature_store)
            COALESCE((fs_company.features->>'industry')::text, 'unknown') as industry,
            COALESCE((fs_company.features->>'size_bucket')::text, 'unknown') as size_bucket,
            COALESCE((fs_company.features->>'uae_presence')::int, 0) as uae_presence,
            COALESCE((fs_company.features->>'account_age_days')::numeric, 0) as account_age_days,
            COALESCE((fs_company.features->>'active_days_90d')::int, 0) as active_days_90d,
            COALESCE((fs_company.features->>'emails_sent_total')::int, 0) as emails_sent_total,
            COALESCE((fs_company.features->>'open_rate')::numeric, 0) as company_open_rate,
            COALESCE((fs_company.features->>'reply_rate')::numeric, 0) as company_reply_rate,

            -- Person features
            COALESCE((fs_person.features->>'function')::text, 'unknown') as function,
            COALESCE((fs_person.features->>'seniority_level')::text, 'unknown') as seniority_level,
            COALESCE((fs_person.features->>'person_emails_received')::int, 0) as person_emails_received,
            COALESCE((fs_person.features->>'person_open_rate')::numeric, 0) as person_open_rate,

            -- Email features
            COALESCE((fs_email.features->>'subject_length')::int, 0) as subject_length,
            COALESCE((fs_email.features->>'body_word_count')::int, 0) as body_word_count,
            COALESCE((fs_email.features->>'personalization_level')::int, 0) as personalization_level,
            COALESCE((fs_email.features->>'readability_score')::numeric, 0) as readability_score,
            COALESCE((fs_email.features->>'has_cta')::int, 0) as has_cta,
            COALESCE((fs_email.features->>'spam_words_count')::int, 0) as spam_words_count,

            -- Time features
            EXTRACT(HOUR FROM eo.sent_at) as send_hour,
            EXTRACT(DOW FROM eo.sent_at) as send_day_of_week,

            -- Target variable
            eo.converted as label

        FROM email_outcomes eo
        LEFT JOIN feature_store fs_company ON fs_company.entity_type = 'company' AND fs_company.entity_id = eo.company_id
        LEFT JOIN feature_store fs_person ON fs_person.entity_type = 'person' AND fs_person.entity_id = eo.person_id
        LEFT JOIN feature_store fs_email ON fs_email.entity_type = 'email' AND fs_email.entity_id = eo.id

        WHERE
            eo.sent_at > NOW() - INTERVAL '180 days'
            AND eo.sent_at < NOW() - INTERVAL '7 days'
            AND eo.delivered = TRUE
        """

        try:
            df = pd.read_sql(query, conn)
        except Exception as e:
            print(f"Error fetching data: {e}")
            # Return empty dataframe with expected columns
            df = pd.DataFrame()
        finally:
            conn.close()

        return df

    def train(self):
        """Train the model"""

        print("Fetching training data...")
        df = self.fetch_training_data()

        if len(df) < 100:
            print(f"⚠️  Insufficient training data ({len(df)} samples). Need at least 100 samples.")
            print("Creating dummy model for demonstration...")
            self._create_dummy_model()
            return 0.5

        print(f"Training on {len(df)} samples")
        print(f"Conversion rate: {df['label'].mean():.2%}")

        # Separate features and labels
        X = df.drop(columns=['label'])
        y = df['label']

        # Handle categorical variables
        X = pd.get_dummies(X, drop_first=True)

        self.feature_columns = X.columns.tolist()

        # Split
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42, stratify=y if y.sum() > 1 else None
        )

        # Train XGBoost
        print("Training XGBoost model...")

        # Calculate scale_pos_weight for class imbalance
        pos_weight = (len(y_train) - y_train.sum()) / max(y_train.sum(), 1)

        self.model = XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,
            scale_pos_weight=pos_weight,
            random_state=42,
            eval_metric='logloss'
        )

        self.model.fit(X_train, y_train)

        # Evaluate
        y_pred = self.model.predict(X_test)
        y_pred_proba = self.model.predict_proba(X_test)[:, 1]

        auc = roc_auc_score(y_test, y_pred_proba)

        print(f"\nModel Performance:")
        print(f"AUC-ROC: {auc:.4f}")
        print("\nClassification Report:")
        print(classification_report(y_test, y_pred))

        # Feature importance
        feature_importance = pd.DataFrame({
            'feature': self.feature_columns,
            'importance': self.model.feature_importances_
        }).sort_values('importance', ascending=False).head(20)

        print("\nTop 20 Features:")
        print(feature_importance.to_string(index=False))

        # Save model
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
        os.makedirs(model_dir, exist_ok=True)

        model_path = os.path.join(model_dir, f"conversion_predictor_v{datetime.now().strftime('%Y%m%d')}.pkl")
        joblib.dump({
            'model': self.model,
            'feature_columns': self.feature_columns,
            'auc': auc
        }, model_path)

        print(f"\nModel saved to {model_path}")

        # Register in database
        self._register_model(model_path, auc, len(df))

        return auc

    def _create_dummy_model(self):
        """Create a dummy model when insufficient data"""
        from sklearn.dummy import DummyClassifier

        self.model = DummyClassifier(strategy='constant', constant=0)
        self.feature_columns = ['dummy']

        # Fit on dummy data
        self.model.fit([[0]], [0])

        model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
        os.makedirs(model_dir, exist_ok=True)

        model_path = os.path.join(model_dir, f"conversion_predictor_dummy.pkl")
        joblib.dump({
            'model': self.model,
            'feature_columns': self.feature_columns,
            'auc': 0.5
        }, model_path)

        print(f"Dummy model saved to {model_path}")
        self._register_model(model_path, 0.5, 0)

    def predict(self, features):
        """Predict conversion probability for new data"""

        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        # Ensure features match training columns
        features_df = pd.DataFrame([features])
        features_df = pd.get_dummies(features_df)

        # Add missing columns with 0
        for col in self.feature_columns:
            if col not in features_df.columns:
                features_df[col] = 0

        # Select only training columns in same order
        features_df = features_df[self.feature_columns]

        # Predict
        proba = self.model.predict_proba(features_df)[0, 1]

        return {
            'probability': float(proba),
            'confidence': float(max(proba, 1 - proba))
        }

    def _register_model(self, model_path, auc, training_samples):
        """Register trained model in database"""

        try:
            conn = psycopg2.connect(**self.db_config)
            cur = conn.cursor()

            cur.execute("""
                INSERT INTO ml_models (
                    model_name, model_version, model_type, model_path,
                    feature_columns, metrics, status, deployed_at, training_samples
                ) VALUES (
                    'conversion_predictor',
                    %s,
                    'xgboost',
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
                json.dumps({'auc_roc': auc}),
                training_samples
            ])

            conn.commit()
            cur.close()
            conn.close()

            print(f"✅ Model registered in database")
        except Exception as e:
            print(f"⚠️  Failed to register model in database: {e}")

# Training script
if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--predict', type=str, help='JSON features for prediction')
    args = parser.parse_args()

    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'port': int(os.getenv('DB_PORT', 5432)),
        'database': os.getenv('DB_NAME', 'upr'),
        'user': os.getenv('DB_USER', 'postgres'),
        'password': os.getenv('DB_PASSWORD', '')
    }

    predictor = ConversionPredictor(db_config)

    if args.predict:
        # Prediction mode
        features = json.loads(args.predict)

        # Load latest model
        model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
        model_files = [f for f in os.listdir(model_dir) if f.startswith('conversion_predictor')]

        if not model_files:
            print(json.dumps({'error': 'No trained model found'}))
            sys.exit(1)

        latest_model = sorted(model_files)[-1]
        model_path = os.path.join(model_dir, latest_model)

        loaded = joblib.load(model_path)
        predictor.model = loaded['model']
        predictor.feature_columns = loaded['feature_columns']

        result = predictor.predict(features)
        print(json.dumps(result))

    else:
        # Training mode
        try:
            auc = predictor.train()
            print(f"\n✅ Training complete! AUC: {auc:.4f}")
        except Exception as e:
            print(f"\n❌ Training failed: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

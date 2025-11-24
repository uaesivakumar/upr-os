#!/usr/bin/env python3
"""
Conversion Predictor with SHAP Explainability

Users can see WHY a lead got a specific score
"""

import pandas as pd
import numpy as np
from xgboost import XGBClassifier
import joblib
import json
import psycopg2
from datetime import datetime
import os
import sys
import argparse

# Try to import SHAP, but make it optional
try:
    import shap
    SHAP_AVAILABLE = True
except ImportError:
    SHAP_AVAILABLE = False
    print("⚠️  SHAP not available. Install with: pip install shap")

class ExplainableConversionPredictor:

    def __init__(self, db_config):
        self.db_config = db_config
        self.model = None
        self.explainer = None
        self.feature_columns = None

    def train(self):
        """Train model and create SHAP explainer"""

        print("Fetching training data...")
        df = self.fetch_training_data()

        if len(df) < 100:
            print(f"⚠️  Insufficient data ({len(df)} samples)")
            return

        print(f"Training on {len(df)} samples")

        # Separate features and labels
        X = df.drop(columns=['label'])
        y = df['label']

        # Handle categorical variables
        X = pd.get_dummies(X, drop_first=True)
        self.feature_columns = X.columns.tolist()

        # Train XGBoost
        print("Training XGBoost model...")
        pos_weight = (len(y) - y.sum()) / max(y.sum(), 1)

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

        self.model.fit(X, y)

        # Create SHAP explainer if available
        if SHAP_AVAILABLE:
            print("Creating SHAP explainer...")
            self.explainer = shap.TreeExplainer(self.model)

            # Save explainer
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
            os.makedirs(model_dir, exist_ok=True)

            explainer_path = os.path.join(model_dir, 'conversion_explainer.pkl')
            joblib.dump(self.explainer, explainer_path)

            print(f"✅ Explainer saved to {explainer_path}")
        else:
            print("⚠️  SHAP not available - explanations will use feature importance fallback")

        # Save model
        model_path = os.path.join(model_dir, 'conversion_predictor_explainable.pkl')
        joblib.dump({
            'model': self.model,
            'feature_columns': self.feature_columns
        }, model_path)

        print(f"✅ Model saved to {model_path}")

    def predict_with_explanation(self, features):
        """
        Predict conversion probability with explanation

        Returns:
        {
            'probability': 0.75,
            'top_positive_factors': [
                {'feature': 'hiring_signals_90d', 'impact': +0.12, 'value': 5, 'feature_readable': 'Recent hiring activity'},
            ],
            'top_negative_factors': [
                {'feature': 'days_since_last_contact', 'impact': -0.05, 'value': 180}
            ],
            'baseline_probability': 0.15,
            'explanation_summary': 'This lead scores high because...'
        }
        """

        # Load model if not already loaded
        if self.model is None:
            model_dir = os.path.join(os.path.dirname(__file__), '..', 'trained_models')
            model_path = os.path.join(model_dir, 'conversion_predictor_explainable.pkl')

            if not os.path.exists(model_path):
                # Fall back to regular model
                model_path = os.path.join(model_dir, 'conversion_predictor.pkl')

            loaded = joblib.load(model_path)
            self.model = loaded['model']
            self.feature_columns = loaded['feature_columns']

            # Try to load explainer
            if SHAP_AVAILABLE:
                explainer_path = os.path.join(model_dir, 'conversion_explainer.pkl')
                if os.path.exists(explainer_path):
                    self.explainer = joblib.load(explainer_path)

        # Prepare features
        features_df = pd.DataFrame([features])
        features_df = pd.get_dummies(features_df)

        # Ensure all training features present
        for col in self.feature_columns:
            if col not in features_df.columns:
                features_df[col] = 0

        features_df = features_df[self.feature_columns]

        # Predict
        proba = self.model.predict_proba(features_df)[0, 1]

        # Get explanation
        if self.explainer is not None and SHAP_AVAILABLE:
            # Use SHAP for explanation
            explanation = self._explain_with_shap(features_df, proba)
        else:
            # Fallback to feature importance
            explanation = self._explain_with_feature_importance(features_df, proba)

        return explanation

    def _explain_with_shap(self, features_df, proba):
        """Explain using SHAP values"""

        # Get SHAP values
        shap_values = self.explainer.shap_values(features_df)

        # Handle different SHAP output formats
        if isinstance(shap_values, list):
            shap_values = shap_values[1]  # Positive class
        elif len(shap_values.shape) > 2:
            shap_values = shap_values[:, :, 1]  # Positive class

        # Get base value
        base_value = self.explainer.expected_value
        if isinstance(base_value, np.ndarray):
            base_value = base_value[1]

        # Create feature impact list
        feature_impacts = []
        for i, col in enumerate(self.feature_columns):
            feature_impacts.append({
                'feature': col,
                'impact': float(shap_values[0][i]),
                'value': float(features_df.iloc[0][col]),
                'feature_readable': self._make_readable(col)
            })

        # Sort by absolute impact
        feature_impacts.sort(key=lambda x: abs(x['impact']), reverse=True)

        # Separate positive and negative
        positive_factors = [f for f in feature_impacts if f['impact'] > 0][:5]
        negative_factors = [f for f in feature_impacts if f['impact'] < 0][:5]

        return {
            'probability': float(proba),
            'top_positive_factors': positive_factors,
            'top_negative_factors': negative_factors,
            'baseline_probability': float(base_value),
            'explanation_summary': self._generate_summary(positive_factors, negative_factors),
            'explanation_method': 'shap'
        }

    def _explain_with_feature_importance(self, features_df, proba):
        """Fallback explanation using feature importance"""

        # Get feature importance from model
        importances = self.model.feature_importances_

        # Create feature impact list
        feature_impacts = []
        for i, col in enumerate(self.feature_columns):
            # Impact = importance * feature_value (simplified)
            impact = importances[i] * features_df.iloc[0][col]

            feature_impacts.append({
                'feature': col,
                'impact': float(impact),
                'value': float(features_df.iloc[0][col]),
                'feature_readable': self._make_readable(col)
            })

        # Sort by absolute impact
        feature_impacts.sort(key=lambda x: abs(x['impact']), reverse=True)

        # Separate positive and negative
        positive_factors = [f for f in feature_impacts if f['impact'] > 0][:5]
        negative_factors = [f for f in feature_impacts if f['impact'] < 0][:5]

        return {
            'probability': float(proba),
            'top_positive_factors': positive_factors,
            'top_negative_factors': negative_factors,
            'baseline_probability': 0.15,  # Approximate baseline
            'explanation_summary': self._generate_summary(positive_factors, negative_factors),
            'explanation_method': 'feature_importance'
        }

    def _make_readable(self, feature_name):
        """Convert technical feature names to readable format"""

        readable_map = {
            'hiring_signals_90d': 'Recent hiring activity',
            'funding_signals_90d': 'Recent funding activity',
            'news_signals_90d': 'Recent news mentions',
            'open_rate': 'Historical email open rate',
            'reply_rate': 'Historical email reply rate',
            'conversion_rate': 'Historical conversion rate',
            'days_since_last_contact': 'Days since last contact',
            'kb_chunks': 'Available company intelligence',
            'account_age_days': 'Relationship age (days)',
            'subject_length': 'Subject line length',
            'body_word_count': 'Email body length',
            'personalization_level': 'Personalization score',
            'readability_score': 'Email readability',
            'sentiment_score': 'Email sentiment',
            'has_cta': 'Has call-to-action',
            'spam_words_count': 'Spam word count',
            'active_days_90d': 'Active days (last 90d)',
            'emails_sent_total': 'Total emails sent',
            'person_open_rate': 'Person open rate',
            'person_reply_rate': 'Person reply rate',
            'industry_technology': 'Technology industry',
            'industry_finance': 'Finance industry',
            'seniority_level_c_level': 'C-level seniority',
            'seniority_level_vp': 'VP-level seniority',
            'seniority_level_director': 'Director-level',
            'function_hr': 'HR function',
            'function_finance': 'Finance function'
        }

        return readable_map.get(feature_name, feature_name.replace('_', ' ').title())

    def _generate_summary(self, positive, negative):
        """Generate human-readable explanation"""

        if not positive and not negative:
            return "Insufficient data for detailed explanation"

        summary = ""

        if positive:
            top_positive = positive[0]['feature_readable']
            summary += f"This lead scores high because {top_positive} is strong"

            if len(positive) > 1:
                summary += f", plus {len(positive)-1} other positive signals"

        if negative:
            if summary:
                summary += f". However, {negative[0]['feature_readable']} is a concern"
            else:
                summary += f"Low score mainly due to {negative[0]['feature_readable']}"

        return summary + "."

    def fetch_training_data(self):
        """Fetch features + labels from database"""

        conn = psycopg2.connect(**self.db_config)

        query = """
        SELECT
            COALESCE((fs_company.features->>'industry')::text, 'unknown') as industry,
            COALESCE((fs_company.features->>'active_days_90d')::int, 0) as active_days_90d,
            COALESCE((fs_company.features->>'open_rate')::numeric, 0) as company_open_rate,
            COALESCE((fs_person.features->>'seniority_level')::text, 'unknown') as seniority_level,
            COALESCE((fs_person.features->>'person_open_rate')::numeric, 0) as person_open_rate,
            eo.converted as label

        FROM email_outcomes eo
        LEFT JOIN feature_store fs_company ON fs_company.entity_type = 'company' AND fs_company.entity_id = eo.company_id
        LEFT JOIN feature_store fs_person ON fs_person.entity_type = 'person' AND fs_person.entity_id = eo.person_id

        WHERE
            eo.sent_at > NOW() - INTERVAL '180 days'
            AND eo.delivered = TRUE
        LIMIT 1000
        """

        try:
            df = pd.read_sql(query, conn)
        except Exception as e:
            print(f"Error fetching data: {e}")
            df = pd.DataFrame()
        finally:
            conn.close()

        return df

# CLI
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

    predictor = ExplainableConversionPredictor(db_config)

    if args.predict:
        # Prediction mode
        input_data = json.loads(args.predict)

        if input_data.get('action') == 'predict_with_explanation':
            result = predictor.predict_with_explanation(input_data.get('features', {}))
            print(json.dumps(result))
        else:
            print(json.dumps({'error': 'Unknown action'}))

    else:
        # Training mode
        try:
            predictor.train()
            print("\n✅ Training complete!")
        except Exception as e:
            print(f"\n❌ Training failed: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)

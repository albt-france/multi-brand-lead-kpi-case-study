"""Small text spam classifier (TF-IDF + logistic regression), trained on PUBLIC DATA.

Training data: UCI SMS Spam Collection (5,574 labelled SMS, CC BY 4.0).
Honest limit: these are SMS messages, not web-form messages. The model is evaluated on a held-out
SMS test set, then used on the simulated form "message" field as a SECONDARY signal only
(it can add to a lead's suspicion score; it never flags a lead on its own).

Output: data/derived/spam_model_eval.json (metrics) and data/derived/message_scores.csv (lead_id, text_spam_prob)
"""
import json
from pathlib import Path

import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline

ROOT = Path(__file__).resolve().parents[1]
DER = ROOT / "data" / "derived"
DER.mkdir(parents=True, exist_ok=True)

sms = pd.read_csv(ROOT / "data" / "raw" / "sms_spam.tsv", sep="\t", header=None, names=["label", "text"], quoting=3)
y = (sms.label == "spam").astype(int)
X_train, X_test, y_train, y_test = train_test_split(sms.text, y, test_size=0.2, random_state=42, stratify=y)

model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), min_df=2, sublinear_tf=True),
                      LogisticRegression(max_iter=1000, class_weight="balanced"))
model.fit(X_train, y_train)
prob = model.predict_proba(X_test)[:, 1]
pred = (prob >= 0.5).astype(int)
tn, fp, fn, tp = confusion_matrix(y_test, pred).ravel()
ev = {
    "label": "PUBLIC DATA - UCI SMS Spam Collection (CC BY 4.0)",
    "n_total": int(len(sms)), "n_spam": int(y.sum()), "n_test": int(len(y_test)),
    "precision": round(precision_score(y_test, pred), 3), "recall": round(recall_score(y_test, pred), 3),
    "roc_auc": round(roc_auc_score(y_test, prob), 3), "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
    "threshold": 0.5,
}

# Score the simulated form messages (secondary signal; one score per distinct text).
crm = pd.read_csv(ROOT / "data" / "sim" / "crm_contacts.csv", usecols=["lead_id", "message"])
crm = crm[crm.message.notna()]
crm["text_spam_prob"] = model.predict_proba(crm.message)[:, 1].round(4)
crm[["lead_id", "text_spam_prob"]].to_csv(DER / "message_scores.csv", index=False)
ev["form_messages_scored"] = int(len(crm))
ev["form_messages_above_0_8"] = int((crm.text_spam_prob > 0.8).sum())
(DER / "spam_model_eval.json").write_text(json.dumps(ev, indent=1))
print(ev)

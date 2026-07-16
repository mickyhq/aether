import CloseIcon from '@mui/icons-material/Close'
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Tooltip,
  Typography
} from '@mui/material'
import { useState } from 'react'
import { useI18n } from '../i18n/I18nContext'
import { APP_LANGUAGES } from '../i18n/translations'
import type { AppLanguage } from '../i18n/translations'
import type { AnimationQuality } from '../types/weather'

type SetupDialogProps = {
  animationQuality: AnimationQuality
  onAnimationQualityChange: (quality: AnimationQuality) => void
}

const ANIMATION_QUALITIES: AnimationQuality[] = ['low', 'balanced', 'high']

export function SetupDialog({
  animationQuality,
  onAnimationQualityChange
}: SetupDialogProps) {
  const [open, setOpen] = useState(false)
  const { language, setLanguage, t } = useI18n()

  return (
    <>
      <Tooltip title={t('setup.tooltip')}>
        <IconButton
          className="setup-button"
          aria-label={t('setup.tooltip')}
          onClick={() => setOpen(true)}
        >
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby="setup-dialog-title"
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { className: 'setup-dialog-paper' } }}
      >
        <DialogTitle id="setup-dialog-title" className="setup-dialog-title">
          <Box>
            <Typography component="span" className="setup-dialog-eyebrow">
              {t('setup.eyebrow')}
            </Typography>
            <Typography component="h2" variant="h5">
              {t('setup.title')}
            </Typography>
          </Box>
          <IconButton
            aria-label={t('setup.close')}
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers className="setup-dialog-content">
          <Typography>{t('setup.description')}</Typography>
          <FormControl component="fieldset">
            <Typography component="legend" className="setup-section-title">
              {t('setup.language')}
            </Typography>
            <RadioGroup
              row
              className="setup-option-group"
              aria-label={t('setup.language')}
              value={language}
              onChange={event => setLanguage(event.target.value as AppLanguage)}
            >
              {APP_LANGUAGES.map(option => (
                <FormControlLabel
                  key={option}
                  value={option}
                  control={<Radio />}
                  label={t(`language.${option}`)}
                />
              ))}
            </RadioGroup>
          </FormControl>
          <FormControl component="fieldset">
            <Typography component="legend" className="setup-section-title">
              {t('quality.title')}
            </Typography>
            <RadioGroup
              row
              className="setup-option-group"
              aria-label={t('quality.title')}
              value={animationQuality}
              onChange={event => {
                onAnimationQualityChange(
                  event.target.value as AnimationQuality
                )
              }}
            >
              {ANIMATION_QUALITIES.map(option => (
                <FormControlLabel
                  key={option}
                  value={option}
                  control={<Radio />}
                  label={t(`quality.${option}`)}
                />
              ))}
            </RadioGroup>
          </FormControl>
        </DialogContent>
      </Dialog>
    </>
  )
}
